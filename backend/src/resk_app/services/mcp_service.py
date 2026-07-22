"""MCP server management and tool proxy."""

from __future__ import annotations

import uuid
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from resk_app.models.mcp import McpServer
from resk_app.schemas.mcp import McpServerIn, McpServerOut, McpServerUpdate, McpToolCallResponse


def _mask_key(key: str | None) -> str | None:
    if not key or len(key) < 8:
        return None
    return key[:4] + "****" + key[-4:]


def list_servers(db: Session) -> list[McpServerOut]:
    servers = db.execute(select(McpServer).order_by(McpServer.name)).scalars().all()
    return [_to_out(s) for s in servers]


def get_server(db: Session, server_id: uuid.UUID) -> McpServer | None:
    return db.get(McpServer, server_id)


def create_server(db: Session, data: McpServerIn) -> McpServerOut:
    from fastapi import HTTPException, status

    if db.execute(select(McpServer).where(McpServer.name == data.name)).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Server name exists")

    server = McpServer(
        name=data.name,
        endpoint=data.endpoint.rstrip("/"),
        auth_type=data.auth_type,
        api_key=data.api_key,
        trust_level=data.trust_level,
        allowed_tools=data.allowed_tools,
        is_active=data.is_active,
    )
    db.add(server)
    db.commit()
    db.refresh(server)
    return _to_out(server)


def update_server(db: Session, server: McpServer, data: McpServerUpdate) -> McpServerOut:
    if data.name is not None:
        server.name = data.name
    if data.endpoint is not None:
        server.endpoint = data.endpoint.rstrip("/")
    if data.auth_type is not None:
        server.auth_type = data.auth_type
    if data.api_key is not None:
        server.api_key = data.api_key
    if data.trust_level is not None:
        server.trust_level = data.trust_level
    if data.allowed_tools is not None:
        server.allowed_tools = data.allowed_tools
    if data.is_active is not None:
        server.is_active = data.is_active
    db.commit()
    db.refresh(server)
    return _to_out(server)


def delete_server(db: Session, server: McpServer) -> None:
    db.delete(server)
    db.commit()


async def test_connection(server: McpServer) -> dict:
    """Test the MCP server connection by hitting its health/root endpoint."""
    headers = _build_headers(server)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(server.endpoint, headers=headers)
            return {"success": resp.is_success, "status_code": resp.status_code, "message": resp.text[:200]}
    except Exception as exc:
        return {"success": False, "message": str(exc)}


async def list_all_tools(db: Session) -> list[dict]:
    """List tools from all active MCP servers, merged into a single list."""
    from sqlalchemy import select
    servers = db.execute(
        select(McpServer).where(McpServer.is_active == True)  # noqa: E712
    ).scalars().all()

    all_tools: list[dict] = []
    for server in servers:
        server_tools = await list_tools(server)
        for tool in server_tools:
            tool["_server_id"] = str(server.id)
            tool["_server_name"] = server.name
        all_tools.extend(server_tools)
    return all_tools


async def call_tool_by_name(
    db: Session,
    tool_name: str,
    params: dict | None = None,
    tool_allowlist: list[str] | None = None,
) -> McpToolCallResponse:
    """Resolve which server has the tool and call it.

    *tool_allowlist* — optional list of ``server_id:tool_name`` entries from the role.
    If provided, only entries matching the user's role allowlist are callable.
    """
    from sqlalchemy import select
    servers = db.execute(
        select(McpServer).where(McpServer.is_active == True)  # noqa: E712
    ).scalars().all()

    for server in servers:
        sid = str(server.id)
        server_allowed = server.allowed_tools
        if server_allowed and tool_name not in server_allowed:
            continue

        # Role-level allowlist check
        if tool_allowlist is not None:
            expected = f"{sid}:{tool_name}"
            if expected not in tool_allowlist:
                continue

        server_tools = await list_tools(server)
        if any(t.get("name") == tool_name or t.get("function", {}).get("name") == tool_name for t in server_tools):
            return await call_tool(server, tool_name, params)

    return McpToolCallResponse(success=False, error=f"Tool '{tool_name}' not found on any active server")


async def list_tools(server: McpServer) -> list[dict]:
    """List tools exposed by the MCP server via GET /tools or GET /api/tools."""
    headers = _build_headers(server)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            for path in ["/tools", "/api/tools", "/"]:
                try:
                    resp = await client.get(server.endpoint + path, headers=headers)
                    if resp.is_success:
                        data = resp.json()
                        tools = data.get("tools", data.get("data", []))
                        return tools if isinstance(tools, list) else [tools]
                except Exception:
                    continue
    except Exception:
        pass
    return []


async def call_tool(server: McpServer, tool: str, params: dict | None = None) -> McpToolCallResponse:
    """Call a tool on the MCP server via POST /call/{tool}."""
    if server.allowed_tools and tool not in server.allowed_tools:
        return McpToolCallResponse(success=False, error=f"Tool '{tool}' not in allowed list")

    if not server.is_active:
        return McpToolCallResponse(success=False, error="Server is inactive")

    headers = _build_headers(server)
    headers["Content-Type"] = "application/json"

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            url = f"{server.endpoint}/call/{tool}"
            resp = await client.post(url, headers=headers, json=params or {})
            if resp.is_success:
                data = resp.json()
                return McpToolCallResponse(success=True, result=data)
            return McpToolCallResponse(success=False, error=f"HTTP {resp.status_code}: {resp.text[:300]}")
    except Exception as exc:
        return McpToolCallResponse(success=False, error=str(exc))


def _build_headers(server: McpServer) -> dict:
    headers = {}
    if server.api_key:
        if server.auth_type == "bearer":
            headers["Authorization"] = f"Bearer {server.api_key}"
        elif server.auth_type == "header":
            headers["X-API-Key"] = server.api_key
    return headers


def _to_out(s: McpServer) -> McpServerOut:
    return McpServerOut(
        id=s.id,
        name=s.name,
        endpoint=s.endpoint,
        auth_type=s.auth_type,
        api_key_masked=_mask_key(s.api_key) if s.api_key else None,
        trust_level=s.trust_level,
        allowed_tools=s.allowed_tools if isinstance(s.allowed_tools, list) else None,
        is_active=s.is_active,
        created_at=s.created_at,
        updated_at=s.updated_at,
    )

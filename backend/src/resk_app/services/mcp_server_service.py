"""MCP Server mode — JSON-RPC 2.0 handlers and session management.

Exposes RESK as an MCP server that clients (opencode, Claude Code, etc.)
can connect to for security tools (scan, audit, policy check).
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from sqlalchemy.orm import Session

from resk_app.schemas.mcp_server import (
    JsonRpcError,
    JsonRpcRequest,
    JsonRpcResponse,
    McpToolDefinition,
    McpToolInputSchema,
)

# ── Session manager ──

_response_queues: dict[str, asyncio.Queue[dict[str, Any]]] = {}


def create_session() -> str:
    session_id = str(uuid.uuid4())
    _response_queues[session_id] = asyncio.Queue()
    return session_id


async def wait_for_response(session_id: str, timeout: float = 300) -> dict:
    q = _response_queues.get(session_id)
    if q is None:
        raise ValueError(f"Session {session_id} not found")
    return await asyncio.wait_for(q.get(), timeout=timeout)


async def push_response(session_id: str, data: dict) -> None:
    q = _response_queues.get(session_id)
    if q is not None:
        await q.put(data)


def cleanup_session(session_id: str) -> None:
    _response_queues.pop(session_id, None)


# ── Tool registry ──

_TOOL_DEFINITIONS: list[McpToolDefinition] = [
    McpToolDefinition(
        name="scan_prompt",
        description="Scan text through RESK security detectors (prompt injection, exfiltration, etc.). Returns whether the text is blocked and why.",
        inputSchema=McpToolInputSchema(
            properties={
                "text": {"type": "string", "description": "Text to scan"},
                "model": {"type": "string", "description": "Optional model name for context"},
            },
            required=["text"],
        ),
    ),
    McpToolDefinition(
        name="check_policy",
        description="Check text against RESK security policies. Returns matched rules and whether the text would be blocked.",
        inputSchema=McpToolInputSchema(
            properties={
                "text": {"type": "string", "description": "Text to check"},
                "policy_id": {"type": "string", "description": "Optional policy ID"},
            },
            required=["text"],
        ),
    ),
    McpToolDefinition(
        name="audit_search",
        description="Search RESK audit logs for security events, blocked requests, and policy violations.",
        inputSchema=McpToolInputSchema(
            properties={
                "query": {"type": "string", "description": "Search phrase or filter"},
                "limit": {"type": "number", "description": "Max results (default 10)"},
            },
            required=["query"],
        ),
    ),
    McpToolDefinition(
        name="user_sessions",
        description="List agent sessions for a user or across the system.",
        inputSchema=McpToolInputSchema(
            properties={
                "user_id": {"type": "string", "description": "Optional user ID filter"},
            },
        ),
    ),
    McpToolDefinition(
        name="health",
        description="Check RESK server health status.",
        inputSchema=McpToolInputSchema(properties={}),
    ),
]


def list_tools() -> list[dict]:
    return [t.model_dump() for t in _TOOL_DEFINITIONS]


# ── JSON-RPC handlers ──

async def handle_jsonrpc(
    request: JsonRpcRequest,
    db: Session,
    settings: Any,
) -> dict:
    method = request.method
    params = request.params or {}
    req_id = request.id

    try:
        if method == "initialize":
            return _make_result(req_id, {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "resk", "version": "0.1.0"},
            })

        if method == "notifications/initialized":
            return _make_result(req_id, {"ok": True})

        if method == "notifications/cancelled":
            return _make_result(req_id, {"ok": True})

        if method == "tools/list":
            return _make_result(req_id, {"tools": list_tools()})

        if method == "tools/call":
            return await _handle_tool_call(req_id, params, db, settings)

        return _make_error(req_id, -32601, f"Method not found: {method}")

    except Exception as exc:
        return _make_error(req_id, -32603, str(exc))


async def _handle_tool_call(
    req_id: int | str | None,
    params: dict[str, Any],
    db: Session,
    settings: Any,
) -> dict:
    name = params.get("name", "")
    arguments = params.get("arguments", {})

    if name == "health":
        return _make_result(req_id, {"status": "ok", "version": "0.1.0"})

    if name == "scan_prompt":
        return await _scan_prompt(req_id, arguments, db, settings)

    if name == "check_policy":
        return await _check_policy(req_id, arguments, db)

    if name == "audit_search":
        return await _audit_search(req_id, arguments, db)

    if name == "user_sessions":
        return await _user_sessions(req_id, arguments, db)

    return _make_error(req_id, -32601, f"Tool not found: {name}")


async def _scan_prompt(
    req_id: int | str | None,
    args: dict[str, Any],
    db: Session,
    settings: Any,
) -> dict:
    text = args.get("text", "")
    from resk_app.routers.firewall import _run_input_scan

    blocked = _run_input_scan(text, {
        "min_confidence_threshold": 0.3,
        "block_score_threshold": 5.0,
        "block_categories": [],
        "block_on_first_threat": True,
    })

    return _make_result(req_id, {
        "blocked": blocked,
        "scanned_length": len(text),
    })


async def _check_policy(
    req_id: int | str | None,
    args: dict[str, Any],
    db: Session,
) -> dict:
    text = args.get("text", "")
    from resk_app.llm.filter_bridge import post_filter_text
    from resk_app.models.policy import Policy
    from sqlalchemy import select

    policy_id = args.get("policy_id")
    matched_rules = []

    if policy_id:
        policies = [db.get(Policy, uuid.UUID(policy_id))]
    else:
        policies = db.execute(select(Policy)).scalars().all()

    for policy in policies:
        if not policy:
            continue
        for rule in (policy.rules or []):
            phrase = rule.get("phrases", [None])[0] if isinstance(rule.get("phrases"), list) else None
            if phrase and phrase.lower() in text.lower():
                matched_rules.append({
                    "policy_id": str(policy.id),
                    "policy_name": policy.name,
                    "phrase": phrase,
                    "mode": rule.get("mode", "hard"),
                })

    return _make_result(req_id, {
        "matched": len(matched_rules) > 0,
        "matched_rule_count": len(matched_rules),
        "matched_rules": matched_rules,
    })


async def _audit_search(
    req_id: int | str | None,
    args: dict[str, Any],
    db: Session,
) -> dict:
    phrase = args.get("query", "")
    limit = min(int(args.get("limit", 10)), 100)
    from resk_app.models.log_entry import LogEntry
    from sqlalchemy import select, desc

    stmt = (
        select(LogEntry)
        .order_by(desc(LogEntry.created_at))
        .limit(limit)
    )
    if phrase:
        stmt = stmt.where(LogEntry.prompt.ilike(f"%{phrase}%"))

    entries = db.execute(stmt).scalars().all()
    return _make_result(req_id, {
        "entries": [
            {
                "id": str(e.id),
                "user_id": str(e.user_id) if e.user_id else None,
                "status": e.status,
                "model": e.model,
                "blocked_phrase": e.blocked_phrase,
                "backend_type": e.backend_type,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in entries
        ],
        "count": len(entries),
    })


async def _user_sessions(
    req_id: int | str | None,
    args: dict[str, Any],
    db: Session,
) -> dict:
    from resk_app.models.agent_session import AgentSession
    from sqlalchemy import select, desc

    user_id = args.get("user_id")
    stmt = select(AgentSession).order_by(desc(AgentSession.created_at)).limit(20)
    if user_id:
        stmt = stmt.where(AgentSession.user_id == uuid.UUID(user_id))

    sessions = db.execute(stmt).scalars().all()
    return _make_result(req_id, {
        "sessions": [
            {
                "id": str(s.id),
                "user_id": str(s.user_id) if s.user_id else None,
                "turn_count": s.turn_count,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in sessions
        ],
        "count": len(sessions),
    })


# ── Response builders ──

def _make_result(req_id: int | str | None, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _make_error(req_id: int | str | None, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}

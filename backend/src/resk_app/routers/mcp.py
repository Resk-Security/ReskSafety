"""MCP router: server CRUD, connection test, tool call proxy."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from resk_app.auth.dependencies import CurrentAdmin, get_current_admin
from resk_app.db.session import get_db
from resk_app.schemas.mcp import (
    McpServerIn,
    McpServerOut,
    McpServerUpdate,
    McpToolCallRequest,
    McpToolCallResponse,
)
from resk_app.services import mcp_service

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


@router.get("/servers", response_model=list[McpServerOut])
def list_servers(
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    return mcp_service.list_servers(db)


@router.get("/servers/{server_id}", response_model=McpServerOut)
def get_server(
    server_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    s = mcp_service.get_server(db, server_id)
    if not s:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return mcp_service._to_out(s)


@router.post("/servers", response_model=McpServerOut, status_code=201)
def create_server(
    data: McpServerIn,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    return mcp_service.create_server(db, data)


@router.put("/servers/{server_id}", response_model=McpServerOut)
def update_server(
    server_id: uuid.UUID,
    data: McpServerUpdate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    s = mcp_service.get_server(db, server_id)
    if not s:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return mcp_service.update_server(db, s, data)


@router.delete("/servers/{server_id}", status_code=204)
def delete_server(
    server_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    s = mcp_service.get_server(db, server_id)
    if not s:
        raise HTTPException(status_code=404, detail="MCP server not found")
    mcp_service.delete_server(db, s)


@router.post("/servers/{server_id}/test")
async def test_server(
    server_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    s = mcp_service.get_server(db, server_id)
    if not s:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return await mcp_service.test_connection(s)


@router.get("/servers/{server_id}/tools")
async def list_server_tools(
    server_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    s = mcp_service.get_server(db, server_id)
    if not s:
        raise HTTPException(status_code=404, detail="MCP server not found")
    tools = await mcp_service.list_tools(s)
    return {"server_id": str(server_id), "server_name": s.name, "tools": tools}


@router.get("/tools")
async def list_registered_tools(
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    """List all tools available across all active MCP servers."""
    tools = await mcp_service.list_all_tools(db)
    return {"tools": tools, "count": len(tools)}


@router.post("/tools/{tool_name}", response_model=McpToolCallResponse)
async def call_registered_tool(
    tool_name: str,
    body: McpToolCallRequest,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    """Call a tool by name across all active MCP servers (auto-resolve)."""
    return await mcp_service.call_tool_by_name(db, tool_name, body.params)


@router.post("/servers/{server_id}/call/{tool}", response_model=McpToolCallResponse)
async def call_tool(
    server_id: uuid.UUID,
    tool: str,
    body: McpToolCallRequest,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    s = mcp_service.get_server(db, server_id)
    if not s:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return await mcp_service.call_tool(s, tool, body.params)

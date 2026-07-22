"""MCP Server router — exposes RESK as an MCP server via SSE transport.

Endpoints:
  GET  /mcp  — SSE stream (MCP transport)
  POST /mcp/{session_id} — receive JSON-RPC messages from client

Protocol: MCP SSE transport (JSON-RPC 2.0)
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from resk_app.config import get_settings
from resk_app.db.session import get_db
from resk_app.schemas.mcp_server import JsonRpcRequest
from resk_app.services.mcp_server_service import (
    cleanup_session,
    create_session,
    handle_jsonrpc,
    push_response,
    wait_for_response,
)

router = APIRouter(prefix="", tags=["mcp-server"])

KEEPALIVE_INTERVAL = 90  # seconds


@router.get("/mcp")
async def mcp_sse(
    request: Request,
    db: Session = Depends(get_db),
):
    """SSE endpoint for MCP transport.

    Sends an `endpoint` event with the POST URL, then waits for JSON-RPC
    messages via POST to that URL and forwards responses as SSE events.
    """
    session_id = create_session()
    settings = get_settings()

    async def event_generator() -> AsyncGenerator[bytes, None]:
        try:
            base = str(request.base_url).rstrip("/")
            post_url = f"{base}/mcp/{session_id}"
            yield f"event: endpoint\ndata: {post_url}\n\n".encode()

            while True:
                try:
                    response = await wait_for_response(session_id, timeout=KEEPALIVE_INTERVAL)
                    yield f"event: message\ndata: {json.dumps(response, ensure_ascii=False)}\n\n".encode()
                except asyncio.TimeoutError:
                    yield b": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            cleanup_session(session_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/mcp/{session_id}")
async def mcp_message(
    session_id: str,
    body: JsonRpcRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Receive a JSON-RPC message for an MCP session.

    The response is sent back through the SSE stream for this session.
    """
    settings = get_settings()

    try:
        result = await handle_jsonrpc(body, db, settings)
        await push_response(session_id, result)
    except Exception as exc:
        error_response = {
            "jsonrpc": "2.0",
            "id": body.id,
            "error": {"code": -32603, "message": str(exc)},
        }
        await push_response(session_id, error_response)

    return {"ok": True}

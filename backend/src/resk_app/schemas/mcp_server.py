"""JSON-RPC 2.0 schemas for MCP Server mode."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class JsonRpcRequest(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    id: int | str | None = None
    method: str
    params: dict[str, Any] = {}


class JsonRpcResponse(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    id: int | str | None = None
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None


class JsonRpcError(BaseModel):
    code: int
    message: str
    data: Any = None


class McpToolInputSchema(BaseModel):
    type: str = "object"
    properties: dict[str, Any] = {}
    required: list[str] = []


class McpToolDefinition(BaseModel):
    name: str
    description: str
    inputSchema: McpToolInputSchema


class McpInitializeResult(BaseModel):
    protocolVersion: str = "2024-11-05"
    capabilities: dict[str, Any] = {"tools": {}}
    serverInfo: dict[str, str] = {"name": "resk", "version": "0.1.0"}

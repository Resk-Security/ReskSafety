"""Schemas for agent sessions and tools."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SessionOut(BaseModel):
    id: str
    user_id: str | None = None
    session_id: str
    agent_id: str
    agent_type: str = "opencode"
    status: str = "active"
    tokens_in: int = 0
    tokens_out: int = 0
    total_tokens: int = 0
    tools_connected: list[str] = []
    metadata: dict | None = None
    started_at: str | None = None
    last_seen_at: str | None = None


class ToolCallOut(BaseModel):
    id: str
    session_id: str
    agent_id: str
    tool_name: str
    tool_type: str = "function"
    duration_ms: int | None = None
    tokens_cost: int = 0
    success: bool = True
    created_at: str | None = None


class SessionStatsOut(BaseModel):
    total_sessions: int = 0
    active_sessions: int = 0
    completed_sessions: int = 0
    total_tokens: int = 0
    unique_tools: list[str] = []
    unique_agents: int = 0
    daily: list[dict] = []


class RecordActionIn(BaseModel):
    """Compatible with reskPoints ActionLog.to_dict()."""
    user_id: str | None = None
    session_id: str
    agent_id: str
    agent_type: str = "opencode"
    action: str = ""
    tokens_in: int = 0
    tokens_out: int = 0
    tools: list[dict] | None = None
    success: bool = True
    duration_ms: float | None = None
    metadata: dict | None = None
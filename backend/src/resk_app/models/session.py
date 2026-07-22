"""Agent session model: tracks agent/session activity per user.

This bridges reskPoints ActionLogs into the RESK app database,
recording session starts, tool calls, token usage, and agents.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from resk_app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AgentSession(Base):
    __tablename__ = "agent_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        default=uuid.uuid4, primary_key=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    session_id: Mapped[str] = mapped_column(String(128), index=True)
    agent_id: Mapped[str] = mapped_column(String(128), index=True)
    agent_type: Mapped[str] = mapped_column(String(64), default="opencode")
    status: Mapped[str] = mapped_column(String(16), default="active")
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(BigInteger, default=0)
    tools_connected: Mapped[list] = mapped_column(JSON, default=list)
    meta_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<AgentSession {self.agent_id!r} {self.session_id!r} {self.status}>"

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "user_id": str(self.user_id) if self.user_id else None,
            "session_id": self.session_id,
            "agent_id": self.agent_id,
            "agent_type": self.agent_type,
            "status": self.status,
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "total_tokens": self.total_tokens,
            "tools_connected": self.tools_connected or [],
            "metadata": self.meta_data,
            "started_at": self.started_at.isoformat(),
            "last_seen_at": self.last_seen_at.isoformat(),
        }


class ToolCall(Base):
    __tablename__ = "tool_calls"

    id: Mapped[uuid.UUID] = mapped_column(
        default=uuid.uuid4, primary_key=True
    )
    session_id: Mapped[str] = mapped_column(String(128), index=True)
    agent_id: Mapped[str] = mapped_column(String(128), index=True)
    tool_name: Mapped[str] = mapped_column(String(128), nullable=False)
    tool_type: Mapped[str] = mapped_column(String(32), default="function")
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_cost: Mapped[int] = mapped_column(Integer, default=0)
    success: Mapped[bool] = mapped_column(default=True)
    parameters: Mapped[dict] = mapped_column(JSON, default=dict)
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ToolCall {self.tool_name} @ {self.session_id}>"

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "session_id": self.session_id,
            "agent_id": self.agent_id,
            "tool_name": self.tool_name,
            "tool_type": self.tool_type,
            "duration_ms": self.duration_ms,
            "tokens_cost": self.tokens_cost,
            "success": self.success,
            "created_at": self.created_at.isoformat(),
        }
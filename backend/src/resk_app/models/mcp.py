from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from resk_app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class McpServer(Base):
    __tablename__ = "mcp_servers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    endpoint: Mapped[str] = mapped_column(String(512))
    auth_type: Mapped[str] = mapped_column(String(32), default="none")
    api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    trust_level: Mapped[str] = mapped_column(String(16), default="sandboxed")
    allowed_tools: Mapped[list | None] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

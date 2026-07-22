from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from resk_app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Hook(Base):
    __tablename__ = "hooks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    hook_type: Mapped[str] = mapped_column(String(32), default="before_tool")
    command: Mapped[str] = mapped_column(Text, default="")
    timeout_sec: Mapped[int] = mapped_column(Integer, default=30)
    action: Mapped[str] = mapped_column(String(16), default="block")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ModelSecurityPolicy(Base):
    __tablename__ = "model_security_policies"

    model_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("models.id", ondelete="CASCADE"), primary_key=True
    )
    policy_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("policies.id", ondelete="CASCADE"), primary_key=True
    )
    hook_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hooks.id", ondelete="SET NULL"), nullable=True
    )

"""Policy model: rules (M2M) + per-policy use-case configs (semantic, ACL, classifiers)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from resk_app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    mask: Mapped[int | None] = mapped_column(default=None, nullable=True)

    # Legacy columns — kept for DB schema compatibility
    logit_rules: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    tool_whitelist: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    scanning_config: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    logits_config: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)

    # Per-policy use-case configs (JSON) — inline
    semantic_detection: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    access_control: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    classifiers: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    scanning_pipeline: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    memory_injection_rules: Mapped[list | None] = mapped_column(JSON, nullable=True, default=None)
    context_strategy: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)

    # References to standalone PolicyConfig entities (nullable)
    semantic_detection_config_id: Mapped[uuid.UUID | None] = mapped_column(
        default=None, nullable=True
    )
    access_control_config_id: Mapped[uuid.UUID | None] = mapped_column(
        default=None, nullable=True
    )
    classifiers_config_id: Mapped[uuid.UUID | None] = mapped_column(
        default=None, nullable=True
    )
    scanning_pipeline_config_id: Mapped[uuid.UUID | None] = mapped_column(
        default=None, nullable=True
    )

    # M2M to PolicyRule
    rules: Mapped[list["PolicyRule"]] = relationship(  # noqa: F821
        secondary="policy_policy_rules",
        lazy="selectin",
        cascade="save-update, merge",
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    def __repr__(self) -> str:
        return f"<Policy {self.name!r}>"

"""PolicyRule model — standalone entity with M2M to Policy."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, Float, ForeignKey, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from resk_app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


policy_policy_rules = Table(
    "policy_policy_rules",
    Base.metadata,
    Column("policy_id", ForeignKey("policies.id", ondelete="CASCADE"), primary_key=True),
    Column("policy_rule_id", ForeignKey("policy_rules.id", ondelete="CASCADE"), primary_key=True),
)


class PolicyRule(Base):
    __tablename__ = "policy_rules"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    rule_type: Mapped[str] = mapped_column(String(32), default="contains")
    phrases: Mapped[list] = mapped_column(JSON, default=list)
    mode: Mapped[str] = mapped_column(String(16), default="hard")
    penalty: Mapped[float] = mapped_column(Float, default=10.0)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=_utcnow, onupdate=_utcnow)

    def __repr__(self) -> str:
        return f"<PolicyRule {self.name!r}>"

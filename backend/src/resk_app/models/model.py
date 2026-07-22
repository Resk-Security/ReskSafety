from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from resk_app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Model(Base):
    __tablename__ = "models"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    provider_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("providers.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(128), index=True)
    type: Mapped[str] = mapped_column(String(16), default="remote")
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    top_k: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stream_supported: Mapped[bool] = mapped_column(Boolean, default=True)
    context_window: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_length_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    special_tokens: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    context_full_strategy: Mapped[str] = mapped_column(String(16), default="truncate")
    injection_rules: Mapped[list | None] = mapped_column(JSON, nullable=True)
    tokenizer_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("provider_id", "name", name="uq_provider_model"),
    )

    provider: Mapped["Provider"] = relationship(
        "Provider", back_populates="models_list", foreign_keys=[provider_id]
    )

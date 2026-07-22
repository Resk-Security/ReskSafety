from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from resk_app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Provider(Base):
    __tablename__ = "providers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    provider_type: Mapped[str] = mapped_column(String(32), default="openai")
    endpoint: Mapped[str] = mapped_column(String(256))
    api_key_enc: Mapped[str | None] = mapped_column(String(512), nullable=True)
    models: Mapped[list | None] = mapped_column(JSON, nullable=True)
    default_model: Mapped[str] = mapped_column(String(64), default="gpt-4o-mini")
    stream_supported: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    security_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    special_tokens: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    response_length_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    default_model_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("models.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    models_list: Mapped[list["Model"]] = relationship(
        "Model", back_populates="provider", cascade="all, delete-orphan",
        foreign_keys="Model.provider_id",
    )
    default_model_ref: Mapped["Model | None"] = relationship(
        "Model", foreign_keys=[default_model_id],
        post_update=True,
    )
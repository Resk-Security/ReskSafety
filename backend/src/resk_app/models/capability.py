"""Capability model: bit 0..63 = named capability (RBAC bitmask source of truth)."""

from __future__ import annotations

import uuid

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from resk_app.db.base import Base


class Capability(Base):
    __tablename__ = "capabilities"

    bit_position: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, default="")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Capability bit={self.bit_position} name={self.name!r}>"

"""Role model: capabilities_mask (64-bit) + M2M to Policy."""

from __future__ import annotations

import uuid

from sqlalchemy import BigInteger, Column, ForeignKey, String, Table, Text
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from resk_app.db.base import Base

role_policies = Table(
    "role_policies",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("policy_id", ForeignKey("policies.id", ondelete="CASCADE"), primary_key=True),
)


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    capabilities_mask: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    mcp_tool_allowlist: Mapped[list | None] = mapped_column(JSON, nullable=True)

    policies: Mapped[list["Policy"]] = relationship(  # noqa: F821
        secondary=role_policies,
        lazy="selectin",
        cascade="save-update, merge",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Role {self.name!r} mask={self.capabilities_mask:#018b}>"

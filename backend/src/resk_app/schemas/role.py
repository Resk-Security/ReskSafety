"""Role schemas."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field


class RoleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    description: str = ""
    capabilities_mask: int = 0
    policy_ids: list[uuid.UUID] = []
    mcp_tool_allowlist: list[str] | None = None


class RoleUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=64)
    description: str | None = None
    capabilities_mask: int | None = None
    policy_ids: list[uuid.UUID] | None = None
    mcp_tool_allowlist: list[str] | None = None


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str
    capabilities_mask: int
    active_bits: list[int] = []
    mcp_tool_allowlist: list[str] | None = None

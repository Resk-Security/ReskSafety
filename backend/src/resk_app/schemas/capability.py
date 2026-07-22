"""Capability schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class CapabilityCreate(BaseModel):
    bit_position: int = Field(..., ge=0, le=63)
    name: str = Field(..., min_length=1, max_length=64)
    description: str = ""


class CapabilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    bit_position: int
    name: str
    description: str

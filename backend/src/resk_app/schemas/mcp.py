from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class McpServerIn(BaseModel):
    name: str = Field(..., max_length=128)
    endpoint: str = Field(..., max_length=512)
    auth_type: str = Field(default="none", max_length=32)
    api_key: str | None = None
    trust_level: str = Field(default="sandboxed", max_length=16)
    allowed_tools: list[str] | None = None
    is_active: bool = True


class McpServerUpdate(BaseModel):
    name: str | None = Field(None, max_length=128)
    endpoint: str | None = Field(None, max_length=512)
    auth_type: str | None = Field(None, max_length=32)
    api_key: str | None = None
    trust_level: str | None = Field(None, max_length=16)
    allowed_tools: list[str] | None = None
    is_active: bool | None = None


class McpServerOut(BaseModel):
    id: uuid.UUID
    name: str
    endpoint: str
    auth_type: str
    api_key_masked: str | None = None
    trust_level: str
    allowed_tools: list[str] | None = None
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class McpToolCallRequest(BaseModel):
    tool: str = Field(..., max_length=128)
    params: dict = Field(default_factory=dict)


class McpToolCallResponse(BaseModel):
    success: bool
    result: dict | None = None
    error: str | None = None

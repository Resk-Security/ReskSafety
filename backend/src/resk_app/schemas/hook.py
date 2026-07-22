from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class HookIn(BaseModel):
    name: str = Field(..., max_length=128)
    hook_type: str = Field(default="before_tool", max_length=32)
    command: str = Field(default="", max_length=10000)
    timeout_sec: int = Field(default=30, ge=1, le=300)
    action: str = Field(default="block", max_length=16)
    is_active: bool = True


class HookUpdate(BaseModel):
    name: str | None = Field(None, max_length=128)
    hook_type: str | None = Field(None, max_length=32)
    command: str | None = Field(None, max_length=10000)
    timeout_sec: int | None = Field(None, ge=1, le=300)
    action: str | None = Field(None, max_length=16)
    is_active: bool | None = None


class HookOut(BaseModel):
    id: uuid.UUID
    name: str
    hook_type: str
    command: str
    timeout_sec: int
    action: str
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class ModelSecurityPolicyIn(BaseModel):
    policy_id: uuid.UUID
    hook_id: uuid.UUID | None = None


class ModelSecurityPolicyOut(BaseModel):
    model_id: uuid.UUID
    policy_id: uuid.UUID
    hook_id: uuid.UUID | None = None


class ModelSecurityInfo(BaseModel):
    model_id: uuid.UUID
    model_name: str
    policies: list[dict] = []
    hooks: list[dict] = []

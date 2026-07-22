"""User schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from resk_app.schemas.role import RoleOut


class UserCreate(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    is_active: bool = True
    is_admin: bool = False
    role_ids: list[uuid.UUID] = []


class UserUpdate(BaseModel):
    username: str | None = Field(None, min_length=1, max_length=64)
    email: EmailStr | None = None
    password: str | None = Field(None, min_length=8, max_length=128)
    is_active: bool | None = None
    is_admin: bool | None = None
    role_ids: list[uuid.UUID] | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    email: EmailStr
    is_active: bool
    is_admin: bool
    created_at: datetime
    updated_at: datetime
    roles: list[RoleOut] = []
    session_count: int = 0
    total_tokens: int = 0


class UserWithMask(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    email: EmailStr
    is_admin: bool
    capabilities_mask: int
    active_bits: list[int] = []
    roles: list[RoleOut] = []


RoleOut.model_rebuild()
UserOut.model_rebuild()
UserWithMask.model_rebuild()

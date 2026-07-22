from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class MemoryEntryIn(BaseModel):
    session_id: str = Field(..., max_length=128)
    turn_number: int = 0
    role: str = Field(default="user", max_length=16)
    content: str = Field(default="", max_length=100_000)
    summary: str | None = None
    token_count: int | None = None
    priority: int = 0
    inject_at: str = Field(default="never", max_length=16)
    inject_every_n: int | None = None


class MemoryEntryUpdate(BaseModel):
    content: str | None = None
    summary: str | None = None
    priority: int | None = None
    inject_at: str | None = None
    inject_every_n: int | None = None


class MemoryEntryOut(BaseModel):
    id: uuid.UUID
    session_id: str
    turn_number: int
    role: str
    content: str
    summary: str | None = None
    token_count: int | None = None
    priority: int
    inject_at: str
    inject_every_n: int | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class MemorySummarizeRequest(BaseModel):
    session_id: str = Field(..., max_length=128)
    max_tokens: int = 2000

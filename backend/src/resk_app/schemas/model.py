from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ModelIn(BaseModel):
    provider_id: uuid.UUID | None = None
    name: str = Field(..., max_length=128)
    type: str = Field(default="remote", max_length=16)
    temperature: float | None = None
    top_k: int | None = None
    max_tokens: int | None = None
    stream_supported: bool = True
    context_window: int | None = None
    response_length_limit: int | None = None
    special_tokens: dict[str, int] | None = None
    context_full_strategy: str = "truncate"
    injection_rules: list[dict] | None = None
    tokenizer_config: dict | None = None
    is_active: bool = True


class ModelUpdate(BaseModel):
    provider_id: uuid.UUID | None = None
    name: str | None = Field(None, max_length=128)
    type: str | None = Field(None, max_length=16)
    temperature: float | None = None
    top_k: int | None = None
    max_tokens: int | None = None
    stream_supported: bool | None = None
    context_window: int | None = None
    response_length_limit: int | None = None
    special_tokens: dict[str, int] | None = None
    context_full_strategy: str | None = None
    injection_rules: list[dict] | None = None
    tokenizer_config: dict | None = None
    is_active: bool | None = None


class ModelOut(BaseModel):
    id: uuid.UUID
    provider_id: uuid.UUID | None = None
    name: str
    type: str
    temperature: float | None = None
    top_k: int | None = None
    max_tokens: int | None = None
    stream_supported: bool
    context_window: int | None = None
    response_length_limit: int | None = None
    special_tokens: dict[str, int] | None = None
    context_full_strategy: str
    injection_rules: list[dict] | None = None
    tokenizer_config: dict | None = None
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SecurityLayerConfig(BaseModel):
    input_scanning: bool = False
    logits_filtering: bool = False


class ProviderIn(BaseModel):
    name: str = Field(..., max_length=64)
    provider_type: str = Field(default="openai", max_length=32)
    endpoint: str = Field(..., max_length=256)
    api_key: str | None = None
    models: list[str] | None = None
    default_model: str = Field(default="gpt-4o-mini", max_length=64)
    stream_supported: bool = True
    is_active: bool = True
    security_config: SecurityLayerConfig | None = None
    special_tokens: dict[str, int] | None = None
    response_length_limit: int | None = None


class ProviderUpdate(BaseModel):
    name: str | None = Field(None, max_length=64)
    provider_type: str | None = Field(None, max_length=32)
    endpoint: str | None = Field(None, max_length=256)
    api_key: str | None = None
    models: list[str] | None = None
    default_model: str | None = Field(None, max_length=64)
    stream_supported: bool | None = None
    is_active: bool | None = None
    security_config: SecurityLayerConfig | None = None
    special_tokens: dict[str, int] | None = None
    response_length_limit: int | None = None


class ProviderOut(BaseModel):
    id: uuid.UUID
    name: str
    provider_type: str
    endpoint: str
    api_key_masked: str | None = None
    models: list[str] | None = None
    default_model: str
    stream_supported: bool
    is_active: bool
    security_config: dict | None = None
    special_tokens: dict[str, int] | None = None
    response_length_limit: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class ProviderTestResult(BaseModel):
    success: bool
    message: str
    models_found: list[str] | None = None
"""PolicyConfig schemas — standalone, reusable SD / ACL / Classifier configs."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class PolicyConfigCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: str = ""
    config_type: str = Field(
        ...,
        pattern=r"^(semantic_detection|access_control|classifiers|scanning_pipeline)$",
    )
    config: dict[str, Any]


class PolicyConfigUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=256)
    description: str | None = None
    config: dict[str, Any] | None = None


class PolicyConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str
    config_type: str
    config: dict[str, Any]
    created_at: datetime
    updated_at: datetime

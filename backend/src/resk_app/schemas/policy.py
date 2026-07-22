"""Policy schemas — rules (named entities) + per-policy use-case configs."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from resk_app.schemas.use_cases import (
    AccessControlConfig,
    ClassifiersConfig,
    ScanningPipelineConfig,
    SemanticDetectionConfig,
)


class PolicyRuleBase(BaseModel):
    """One named, described rule — the atomic building block of policies."""

    name: str = Field(..., min_length=1, max_length=256)
    description: str = ""
    rule_type: str = Field("contains", pattern="^(exact|contains|startswith)$")
    phrases: list[str] = Field(..., min_length=1)
    mode: str = Field("hard", pattern="^(hard|bias)$")
    penalty: float = Field(10.0, ge=-100.0)


class PolicyRuleCreate(PolicyRuleBase):
    id: uuid.UUID | None = None  # set on update to match existing rule


class PolicyRuleUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=256)
    description: str | None = None
    rule_type: str | None = Field(None, pattern="^(exact|contains|startswith)$")
    phrases: list[str] | None = None
    mode: str | None = Field(None, pattern="^(hard|bias)$")
    penalty: float | None = None


class PolicyRuleOut(PolicyRuleBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class PolicySemanticDetectionConfig(SemanticDetectionConfig):
    """Alias — embedded in Policy."""


class PolicyAccessControlConfig(AccessControlConfig):
    """Alias — embedded in Policy."""


class PolicyClassifiersConfig(ClassifiersConfig):
    """Alias — embedded in Policy."""


class PolicyScanningPipelineConfig(ScanningPipelineConfig):
    """Alias — embedded in Policy."""


class PolicyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: str = ""
    mask: int | None = None
    rules: list[PolicyRuleCreate] = []
    semantic_detection: SemanticDetectionConfig | None = None
    access_control: AccessControlConfig | None = None
    classifiers: ClassifiersConfig | None = None
    scanning_pipeline: ScanningPipelineConfig | None = None
    memory_injection_rules: list[dict] | None = None
    context_strategy: dict | None = None
    semantic_detection_config_id: uuid.UUID | None = None
    access_control_config_id: uuid.UUID | None = None
    classifiers_config_id: uuid.UUID | None = None
    scanning_pipeline_config_id: uuid.UUID | None = None


class PolicyUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=128)
    description: str | None = None
    mask: int | None = None
    rules: list[PolicyRuleCreate] | None = None
    semantic_detection: SemanticDetectionConfig | None = None
    access_control: AccessControlConfig | None = None
    classifiers: ClassifiersConfig | None = None
    scanning_pipeline: ScanningPipelineConfig | None = None
    memory_injection_rules: list[dict] | None = None
    context_strategy: dict | None = None
    semantic_detection_config_id: uuid.UUID | None = None
    access_control_config_id: uuid.UUID | None = None
    classifiers_config_id: uuid.UUID | None = None
    scanning_pipeline_config_id: uuid.UUID | None = None


class PolicyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str
    mask: int | None
    rules: list[PolicyRuleOut] = []
    semantic_detection: dict | None = None
    access_control: dict | None = None
    classifiers: dict | None = None
    scanning_pipeline: dict | None = None
    memory_injection_rules: list[dict] | None = None
    context_strategy: dict | None = None
    semantic_detection_config_id: uuid.UUID | None = None
    access_control_config_id: uuid.UUID | None = None
    classifiers_config_id: uuid.UUID | None = None
    scanning_pipeline_config_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class PolicyPreviewRequest(BaseModel):
    text: str = Field(..., min_length=1)
    rules: list[PolicyRuleBase] = []


class PolicyPreviewResponse(BaseModel):
    blocked: bool
    matched_phrases: list[str]
    tokens: list[int] = []

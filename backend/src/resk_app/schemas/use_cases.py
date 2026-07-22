from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AttackPattern(BaseModel):
    label: str
    pattern: str
    tags: list[str] = []


class ExternalConnector(BaseModel):
    enabled: bool = False
    provider: str = "openai"
    api_key: str = ""
    model: str = "text-embedding-3-small"
    endpoint: str = ""
    timeout: int = 30


class VectorDbConfig(BaseModel):
    enabled: bool = False
    type: str = "pinecone"
    endpoint: str = ""
    api_key: str = ""
    index_name: str = ""
    dimension: int = 1536
    metric: str = "cosine"


class ScanningPipelineConfig(BaseModel):
    """Standalone scanning pipeline — block categories, patterns, thresholds."""

    block_categories: list[str] = Field(default_factory=lambda: [
        "direct_injection", "bypass_detection", "exfiltration",
    ])
    attack_patterns: list[AttackPattern] = []
    block_on_first_threat: bool = True
    min_confidence_threshold: float = 0.3
    block_score_threshold: float = 5.0


class SemanticDetectionConfig(BaseModel):
    """Built-in vector similarity detection (vector DB or TF-IDF) + scanning pipeline."""

    enabled: bool = False

    # Vector similarity
    threshold: float = 0.85
    backend: str = "local"
    vector_db: VectorDbConfig = Field(default_factory=VectorDbConfig)
    external_connector: ExternalConnector = ExternalConnector()
    attack_patterns: list[AttackPattern] = []

    # Scanning pipeline (was scanning_config)
    min_confidence_threshold: float = 0.3
    block_score_threshold: float = 5.0
    block_categories: list[str] = Field(default_factory=lambda: [
        "direct_injection", "bypass_detection", "exfiltration",
    ])
    block_on_first_threat: bool = True


class AclNode(BaseModel):
    condition: str | None = None
    branches: dict[str, "AclNode"] = {}
    action: str | None = None
    reason: str | None = None


class AccessControlConfig(BaseModel):
    enabled: bool = False
    root: AclNode | None = None


class ClassifierRule(BaseModel):
    name: str
    model: str = ""
    enabled: bool = True
    threshold: float = 0.7
    action: str = "warn"
    category: str = "custom"


class ClassifiersConfig(BaseModel):
    """ML classifiers + logits filtering + jailbreak pattern config (merged)."""

    enabled: bool = False
    rules: list[ClassifierRule] = []

    # Logits filtering (was logits_config)
    shadow_penalty: float = -15.0
    multi_level: dict[str, Any] = Field(default_factory=lambda: {
        "enabled": False,
        "penalties": {"high": -20.0, "medium": -10.0, "low": -5.0},
    })

    # Jailbreak substring patterns (always applied, no ML dependency)
    jailbreak_patterns: list[str] = []

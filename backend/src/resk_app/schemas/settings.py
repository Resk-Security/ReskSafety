"""Global engine settings schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class GlobalScanningSettings(BaseModel):
    fail_open: bool = False
    enable_caching: bool = True
    max_input_length: int = 100_000
    request_timeout_ms: int = 5_000
    rate_limit_per_sec: int = 100
    concurrent_scan_limit: int = 50
    cache_ttl_sec: int = 300
    stop_on_first_match: bool = False
    log_all_scan_results: bool = True
    block_on_engine_error: bool = False
    languages: list[str] = Field(default_factory=lambda: ["en", "fr"])


class GlobalLogitsSettings(BaseModel):
    device: str = "cpu"
    hot_reload_interval: int = 60
    batch_size: int = 32
    max_sequence_length: int = 2048
    default_shadow_penalty: float = -15.0
    fallback_action: str = "block"


class GlobalObservabilitySettings(BaseModel):
    sampling_default_rate: float = 1.0
    buffering_max_size: int = 10_000
    flush_interval_sec: int = 10
    mask_sensitive_fields: bool = True


class GlobalPipelineSettings(BaseModel):
    default_action: str = "allow"
    log_level: str = "info"
    enable_telemetry: bool = True
    maintenance_mode: bool = False


class ModelTokenizerConfig(BaseModel):
    model_name: str
    tokenizer_name: str | None = None
    trust_remote_code: bool = False
    add_prefix_space: bool = False
    custom_special_tokens: list[str] = Field(default_factory=list)
    detected_special_tokens: dict[str, str] = Field(default_factory=dict)
    detected_special_token_ids: list[int] = Field(default_factory=list)


class GlobalTokenizerSettings(BaseModel):
    protect_special_tokens: bool = True
    cache_enabled: bool = True
    timeout_sec: int = 30
    model_tokenizers: dict[str, ModelTokenizerConfig] = Field(default_factory=dict)


class GlobalSettings(BaseModel):
    scanning: GlobalScanningSettings = Field(default_factory=GlobalScanningSettings)
    logits: GlobalLogitsSettings = Field(default_factory=GlobalLogitsSettings)
    observability: GlobalObservabilitySettings = Field(default_factory=GlobalObservabilitySettings)
    pipeline: GlobalPipelineSettings = Field(default_factory=GlobalPipelineSettings)
    tokenizers: GlobalTokenizerSettings = Field(default_factory=GlobalTokenizerSettings)

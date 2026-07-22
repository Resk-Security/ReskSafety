"""Security config schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ScanningConfig(BaseModel):
    enabled: bool = False
    fail_open: bool = False
    block_on_first_threat: bool = True
    min_confidence_threshold: float = 0.3
    block_score_threshold: float = 5.0
    severity_weights: dict[str, float] = Field(default_factory=lambda: {
        "info": 0, "low": 1, "medium": 3, "high": 7, "critical": 10,
    })
    languages: list[str] = Field(default_factory=lambda: ["en", "fr"])
    max_input_length: int = 100_000
    enable_caching: bool = True


class MultiLevelConfig(BaseModel):
    enabled: bool = False
    penalties: dict[str, float] = Field(default_factory=lambda: {
        "high": -20.0, "medium": -10.0, "low": -5.0,
    })


class LogitsConfig(BaseModel):
    enabled: bool = False
    device: str = "cpu"
    shadow_penalty: float = -15.0
    multi_level: MultiLevelConfig = Field(default_factory=MultiLevelConfig)
    hot_reload_interval: int = 60


class ConsolePlatform(BaseModel):
    enabled: bool = True
    format: str = "human"


class FilePlatform(BaseModel):
    enabled: bool = False
    path: str = "/var/log/resk/agent_actions.jsonl"


class WebhookPlatform(BaseModel):
    enabled: bool = False
    url: str = ""
    headers: dict[str, str] = Field(default_factory=dict)


class PrometheusPlatform(BaseModel):
    enabled: bool = False
    pushgateway_url: str = "http://localhost:9091"
    job_name: str = "resk"


class DatadogPlatform(BaseModel):
    enabled: bool = False
    api_key: str = ""
    site: str = "datadoghq.com"
    tags: str = ""


class MaskingConfig(BaseModel):
    enabled: bool = True
    sensitive_fields: list[str] = Field(default_factory=lambda: [
        "api_key", "password", "token", "secret", "authorization",
    ])


class SamplingRule(BaseModel):
    action: str = ""
    rate: float = 1.0


class SamplingConfig(BaseModel):
    default_rate: float = 1.0
    rules: list[SamplingRule] = Field(default_factory=list)


class BufferingConfig(BaseModel):
    max_size: int = 1000
    flush_interval: float = 5.0


class PlatformsConfig(BaseModel):
    console: ConsolePlatform = Field(default_factory=ConsolePlatform)
    file: FilePlatform = Field(default_factory=FilePlatform)
    webhook: WebhookPlatform = Field(default_factory=WebhookPlatform)
    prometheus: PrometheusPlatform = Field(default_factory=PrometheusPlatform)
    datadog: DatadogPlatform = Field(default_factory=DatadogPlatform)


class ObservabilityConfig(BaseModel):
    enabled: bool = False
    environment: str = "development"
    masking: MaskingConfig = Field(default_factory=MaskingConfig)
    sampling: SamplingConfig = Field(default_factory=SamplingConfig)
    buffering: BufferingConfig = Field(default_factory=BufferingConfig)
    platforms: PlatformsConfig = Field(default_factory=PlatformsConfig)


class SecurityConfig(BaseModel):
    scanning: ScanningConfig = Field(default_factory=ScanningConfig)
    logits: LogitsConfig = Field(default_factory=LogitsConfig)
    observability: ObservabilityConfig = Field(default_factory=ObservabilityConfig)


class SecurityTestRequest(BaseModel):
    text: str
    provider_id: str | None = None


class SecurityTestResult(BaseModel):
    threat_detected: bool = False
    score: float = 0.0
    categories: list[str] = Field(default_factory=list)
    message: str = ""

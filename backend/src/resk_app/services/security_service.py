"""Security config management service.

Reads/writes security.yaml and manages patterns/policy file uploads.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

import yaml

from resk_app.config import get_settings
from resk_app.schemas.security import (
    SecurityConfig,
    SecurityTestRequest,
    SecurityTestResult,
)

DEFAULT_CONFIG: dict = {
    "scanning": {
        "enabled": False,
        "fail_open": False,
        "block_on_first_threat": True,
        "min_confidence_threshold": 0.3,
        "block_score_threshold": 5.0,
        "severity_weights": {"info": 0, "low": 1, "medium": 3, "high": 7, "critical": 10},
        "languages": ["en", "fr"],
        "max_input_length": 100_000,
        "enable_caching": True,
    },
    "logits": {
        "enabled": False,
        "device": "cpu",
        "shadow_penalty": -15.0,
        "multi_level": {
            "enabled": False,
            "penalties": {"high": -20.0, "medium": -10.0, "low": -5.0},
        },
        "hot_reload_interval": 60,
    },
    "observability": {
        "enabled": False,
        "environment": "development",
        "masking": {
            "enabled": True,
            "sensitive_fields": [
                "api_key", "password", "token", "secret", "authorization",
            ],
        },
        "sampling": {"default_rate": 1.0, "rules": []},
        "buffering": {"max_size": 1000, "flush_interval": 5.0},
        "platforms": {
            "console": {"enabled": True, "format": "human"},
            "file": {"enabled": False, "path": "/var/log/resk/agent_actions.jsonl"},
            "webhook": {"enabled": False, "url": "", "headers": {}},
            "prometheus": {"enabled": False, "pushgateway_url": "http://localhost:9091", "job_name": "resk"},
            "datadog": {"enabled": False, "api_key": "", "site": "datadoghq.com", "tags": ""},
        },
    },
}


def _config_path() -> Path:
    return Path(get_settings().SECURITY_CONFIG_PATH)


def _patterns_path() -> Path:
    cfg = _config_path()
    return cfg.parent / "patterns.yaml"


def _policy_path() -> Path:
    cfg = _config_path()
    return cfg.parent / "policy.yaml"


def get_config() -> SecurityConfig:
    path = _config_path()
    if not path.exists():
        return SecurityConfig(**DEFAULT_CONFIG)
    try:
        with open(path) as f:
            data = yaml.safe_load(f) or {}
        merged = _merge_defaults(data)
        return SecurityConfig(**merged)
    except Exception:
        return SecurityConfig(**DEFAULT_CONFIG)


def save_config(config: SecurityConfig) -> SecurityConfig:
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    data = config.model_dump()
    with open(path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, indent=2)
    return config


def _merge_defaults(data: dict) -> dict:
    merged = DEFAULT_CONFIG.copy()
    for section in ("scanning", "logits", "observability"):
        if section in data and isinstance(data[section], dict):
            s = merged[section]
            _deep_merge(s, data[section])
    return merged


def _deep_merge(base: dict, override: dict) -> None:
    for k, v in override.items():
        if k in base and isinstance(base[k], dict) and isinstance(v, dict):
            _deep_merge(base[k], v)
        else:
            base[k] = v


def save_patterns_file(file_content: bytes) -> str:
    path = _patterns_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(file_content)
    return str(path)


def get_patterns_content() -> str | None:
    path = _patterns_path()
    if path.exists():
        return path.read_text()
    return None


def save_policy_file(file_content: bytes) -> str:
    path = _policy_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(file_content)
    return str(path)


def get_policy_content() -> str | None:
    path = _policy_path()
    if path.exists():
        return path.read_text()
    return None


def test_security(req: SecurityTestRequest) -> SecurityTestResult:
    config = get_config()
    if not config.scanning.enabled:
        return SecurityTestResult(message="Scanning is disabled")

    try:
        from resk2.core.pipeline import SecurityPipeline
        from resk2.core.config import SecurityConfig as Resk2Config
        from resk2.detectors import (
            DirectInjectionDetector,
            BypassDetector,
            ExfiltrationDetector,
            GoalHijackDetector,
            InterAgentInjectionDetector,
            ContentFramingDetector,
            MemoryPoisoningDetector,
        )

        resk2_cfg = Resk2Config(
            fail_open=config.scanning.fail_open,
            block_on_first_threat=config.scanning.block_on_first_threat,
            min_confidence_threshold=config.scanning.min_confidence_threshold,
            block_score_threshold=config.scanning.block_score_threshold,
            languages=config.scanning.languages,
            max_input_length=config.scanning.max_input_length,
            enable_caching=config.scanning.enable_caching,
            severity_weights=config.scanning.severity_weights,
        )
        pipeline = SecurityPipeline(resk2_cfg)
        pipeline.add(DirectInjectionDetector())
        pipeline.add(BypassDetector())
        pipeline.add(ExfiltrationDetector())
        pipeline.add(GoalHijackDetector())
        pipeline.add(InterAgentInjectionDetector())
        pipeline.add(ContentFramingDetector())
        pipeline.add(MemoryPoisoningDetector())
        result = pipeline.run(req.text)
        return SecurityTestResult(
            threat_detected=result.blocked,
            score=sum(r.confidence for r in result.results if r.is_threat) if result.results else 0.0,
            categories=list({r.category.value for r in result.results if r.category}) if result.results else [],
            message=f"Threat detected: {result.block_reason}" if result.blocked else "No threats detected",
        )
    except ImportError:
        return SecurityTestResult(
            message="Resk-LLM (resk2) not installed. Install with: pip install -e ../../Resk-LLM",
        )
    except Exception as exc:
        return SecurityTestResult(
            message=f"Test error: {exc}",
        )

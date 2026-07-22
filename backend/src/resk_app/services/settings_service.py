"""Global engine settings service.

Reads/writes global settings from a settings.yaml file.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from resk_app.config import get_settings
from resk_app.schemas.settings import GlobalSettings

DEFAULT_SETTINGS: dict = {
    "scanning": {
        "fail_open": False,
        "enable_caching": True,
        "max_input_length": 100_000,
        "request_timeout_ms": 5_000,
        "rate_limit_per_sec": 100,
        "concurrent_scan_limit": 50,
        "cache_ttl_sec": 300,
        "stop_on_first_match": False,
        "log_all_scan_results": True,
        "block_on_engine_error": False,
        "languages": ["en", "fr"],
    },
    "logits": {
        "device": "cpu",
        "hot_reload_interval": 60,
        "batch_size": 32,
        "max_sequence_length": 2048,
        "default_shadow_penalty": -15.0,
        "fallback_action": "block",
    },
    "observability": {
        "sampling_default_rate": 1.0,
        "buffering_max_size": 10_000,
        "flush_interval_sec": 10,
        "mask_sensitive_fields": True,
    },
    "pipeline": {
        "default_action": "allow",
        "log_level": "info",
        "enable_telemetry": True,
        "maintenance_mode": False,
    },
    "tokenizers": {
        "protect_special_tokens": True,
        "cache_enabled": True,
        "timeout_sec": 30,
        "model_tokenizers": {},
    },
}


def _settings_path() -> Path:
    return Path(get_settings().SECURITY_CONFIG_PATH).parent / "settings.yaml"


def get_global_settings() -> GlobalSettings:
    path = _settings_path()
    if not path.exists():
        return GlobalSettings(**DEFAULT_SETTINGS)
    try:
        with open(path) as f:
            data = yaml.safe_load(f) or {}
        merged = DEFAULT_SETTINGS.copy()
        for section in ("scanning", "logits", "observability", "pipeline", "tokenizers"):
            if section in data and isinstance(data[section], dict):
                merged[section].update(data[section])
        return GlobalSettings(**merged)
    except Exception:
        return GlobalSettings(**DEFAULT_SETTINGS)


def save_global_settings(settings: GlobalSettings) -> GlobalSettings:
    path = _settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    data = settings.model_dump()
    with open(path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, indent=2)
    return settings

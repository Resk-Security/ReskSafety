"""Application configuration loaded from environment variables."""

from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


_DEFAULT_JWT_SECRET = "change-me-in-production-please-use-a-long-random-string"
_DEFAULT_CSRF_SECRET = "change-me-csrf-secret"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Core
    DATABASE_URL: str = "sqlite:///./resk.db"
    LOG_LEVEL: str = "INFO"

    # Auth
    JWT_SECRET_KEY: str = _DEFAULT_JWT_SECRET
    JWT_ALGORITHM: str = "HS256"
    JWT_TTL_MIN: int = 60
    JWT_REFRESH_TTL_DAYS: int = 7

    # CSRF
    CSRF_SECRET: str = _DEFAULT_CSRF_SECRET

    # Cookies
    COOKIE_SECURE: bool = False

    # LLM backend
    LLM_BACKEND_TYPE: str = "openai"  # openai | deepseek | vllm | ollama | local | anthropic
    LLM_BACKEND_URL: str = "https://api.deepseek.com/v1"
    LLM_BACKEND_API_KEY: str = ""
    LLM_DEFAULT_MODEL: str = "deepseek-chat"

    # Anthropic-specific key for /v1/messages x-api-key auth
    ANTHROPIC_API_KEY: str = ""

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000,https://resk.fr,https://demo.resk.fr"

    # Logging
    LOG_PROMPTS: bool = False

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 60

    # RESK-LLM (resk2) middleware
    RESK2_ENABLED: bool = False

    # Provider encryption
    PROVIDER_ENCRYPTION_KEY: str = ""

    # Security config
    SECURITY_CONFIG_PATH: str = "./security.yaml"

    # reskPoints
    RESKPOINTS_API_KEY: str = ""

    # Newsletter / Resend
    RESEND_API_KEY: str = ""

    @field_validator("CORS_ORIGINS")
    @classmethod
    def _split_origins(cls, v: str) -> str:
        return v

    @model_validator(mode="after")
    def _reject_default_secrets(self) -> "Settings":
        if self.JWT_SECRET_KEY == _DEFAULT_JWT_SECRET:
            raise ValueError(
                "JWT_SECRET_KEY must be changed from the default value. "
                "Generate a strong random key: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        if self.CSRF_SECRET == _DEFAULT_CSRF_SECRET:
            raise ValueError(
                "CSRF_SECRET must be changed from the default value."
            )
        return self

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()

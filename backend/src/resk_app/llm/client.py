"""HTTP client for distant LLM backends (OpenAI-compatible)."""

from __future__ import annotations

from typing import Any

import httpx

from resk_app.config import get_settings
from resk_app.crypto import decrypt_api_key
from resk_app.models.provider import Provider


async def call_openai_chat(
    messages: list[dict],
    model: str,
    max_tokens: int = 1024,
    temperature: float = 0.7,
    tools: list[dict] | None = None,
    stream: bool = False,
    extra: dict | None = None,
    provider: Provider | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    headers = {"Content-Type": "application/json"}

    if provider and provider.api_key_enc:
        key = decrypt_api_key(provider.api_key_enc, settings.PROVIDER_ENCRYPTION_KEY)
        if key:
            headers["Authorization"] = f"Bearer {key}"
        url = provider.endpoint.rstrip("/") + "/chat/completions"
        model = model or provider.default_model
    else:
        if settings.LLM_BACKEND_API_KEY:
            headers["Authorization"] = f"Bearer {settings.LLM_BACKEND_API_KEY}"
        url = settings.LLM_BACKEND_URL.rstrip("/") + "/chat/completions"
        model = model or settings.LLM_DEFAULT_MODEL

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": stream,
    }
    if tools:
        payload["tools"] = tools
    if extra:
        payload.update(extra)
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        return resp.json()

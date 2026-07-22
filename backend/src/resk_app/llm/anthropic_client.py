"""HTTP client for Anthropic Messages API (both streaming and non-streaming)."""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator

import httpx

from resk_app.config import get_settings
from resk_app.crypto import decrypt_api_key
from resk_app.models.provider import Provider


async def call_anthropic_messages(
    messages: list[dict],
    model: str,
    max_tokens: int = 1024,
    temperature: float | None = None,
    system: str | list[dict] | None = None,
    top_k: int | None = None,
    top_p: float | None = None,
    stop_sequences: list[str] | None = None,
    metadata: dict | None = None,
    stream: bool = False,
    provider: Provider | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    headers = {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
    }

    if provider and provider.api_key_enc:
        key = decrypt_api_key(provider.api_key_enc, settings.PROVIDER_ENCRYPTION_KEY)
        if key:
            headers["x-api-key"] = key
        url = provider.endpoint.rstrip("/") + "/messages"
        model = model or provider.default_model
    else:
        if settings.LLM_BACKEND_API_KEY:
            headers["x-api-key"] = settings.LLM_BACKEND_API_KEY
        url = settings.LLM_BACKEND_URL.rstrip("/") + "/messages"
        model = model or settings.LLM_DEFAULT_MODEL

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "stream": stream,
    }
    if temperature is not None:
        payload["temperature"] = temperature
    if system is not None:
        payload["system"] = system
    if top_k is not None:
        payload["top_k"] = top_k
    if top_p is not None:
        payload["top_p"] = top_p
    if stop_sequences is not None:
        payload["stop_sequences"] = stop_sequences
    if metadata:
        payload["metadata"] = metadata

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        return resp.json()


async def call_anthropic_messages_stream(
    messages: list[dict],
    model: str,
    max_tokens: int = 1024,
    temperature: float | None = None,
    system: str | list[dict] | None = None,
    top_k: int | None = None,
    top_p: float | None = None,
    stop_sequences: list[str] | None = None,
    metadata: dict | None = None,
    provider: Provider | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    settings = get_settings()
    headers = {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "Accept": "text/event-stream",
    }

    if provider and provider.api_key_enc:
        key = decrypt_api_key(provider.api_key_enc, settings.PROVIDER_ENCRYPTION_KEY)
        if key:
            headers["x-api-key"] = key
        url = provider.endpoint.rstrip("/") + "/messages"
        model = model or provider.default_model
    else:
        if settings.LLM_BACKEND_API_KEY:
            headers["x-api-key"] = settings.LLM_BACKEND_API_KEY
        url = settings.LLM_BACKEND_URL.rstrip("/") + "/messages"
        model = model or settings.LLM_DEFAULT_MODEL

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "stream": True,
    }
    if temperature is not None:
        payload["temperature"] = temperature
    if system is not None:
        payload["system"] = system
    if top_k is not None:
        payload["top_k"] = top_k
    if top_p is not None:
        payload["top_p"] = top_p
    if stop_sequences is not None:
        payload["stop_sequences"] = stop_sequences
    if metadata:
        payload["metadata"] = metadata

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                line = line.strip()
                if not line:
                    continue
                if line.startswith("event: "):
                    event_type = line[7:]
                    continue
                if line.startswith("data: "):
                    data_str = line[6:]
                    event = {
                        "event": event_type if event_type else None,
                        "data": {},
                    }
                    try:
                        event["data"] = json.loads(data_str)
                        yield event
                    except json.JSONDecodeError:
                        continue
                    event_type = None


def extract_anthropic_text_delta(event: dict) -> str:
    """Extract text delta from an Anthropic SSE content_block_delta event."""
    if event.get("event") != "content_block_delta":
        return ""
    data = event.get("data", {})
    delta = data.get("delta", {})
    if delta.get("type") == "text_delta":
        return delta.get("text", "")
    return ""


def extract_anthropic_response_text(response: dict) -> str:
    """Extract concatenated text from an Anthropic non-streaming response."""
    content = response.get("content", [])
    texts = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            texts.append(block.get("text", ""))
    return "".join(texts)

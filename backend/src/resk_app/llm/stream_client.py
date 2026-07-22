"""Streaming HTTP client for OpenAI-compatible LLM backends.

Yields SSE `data: ...` lines as parsed dicts.
Supports tool-call delta buffering and EOS biasing for response length limits.
"""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator

import httpx

from resk_app.config import get_settings
from resk_app.crypto import decrypt_api_key
from resk_app.models.provider import Provider


async def call_openai_chat_stream(
    messages: list[dict],
    model: str,
    max_tokens: int = 1024,
    temperature: float = 0.7,
    tools: list[dict] | None = None,
    extra: dict | None = None,
    provider: Provider | None = None,
    response_length_limit: int | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    settings = get_settings()
    headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}

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
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    if tools:
        payload["tools"] = tools
    if extra:
        payload.update(extra)

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                line = line.strip()
                if not line:
                    continue
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        yield {"_done": True}
                        return
                    try:
                        chunk = json.loads(data_str)
                        yield chunk
                    except json.JSONDecodeError:
                        continue


def extract_content_delta(choice: dict) -> str:
    delta = choice.get("delta", {})
    return delta.get("content") or ""


def extract_tool_call_deltas(choice: dict) -> list[dict]:
    delta = choice.get("delta", {})
    return delta.get("tool_calls") or []


def assemble_tool_calls(chunks: list[dict]) -> list[dict]:
    """Buffer delta.tool_calls across SSE chunks into a complete tool_calls list."""
    tool_calls_map: dict[int, dict] = {}

    for chunk in chunks:
        for choice in chunk.get("choices", []):
            for tc in extract_tool_call_deltas(choice):
                idx = tc.get("index", 0)
                if idx not in tool_calls_map:
                    tool_calls_map[idx] = {
                        "id": "",
                        "type": "function",
                        "function": {"name": "", "arguments": ""},
                    }
                frag = tool_calls_map[idx]
                if tc.get("id"):
                    frag["id"] = tc["id"]
                fn = tc.get("function", {})
                if fn.get("name"):
                    frag["function"]["name"] = fn["name"]
                if fn.get("arguments"):
                    frag["function"]["arguments"] += fn["arguments"]

    return [v for _, v in sorted(tool_calls_map.items())]


async def stream_with_eos_bias(
    messages: list[dict],
    model: str,
    max_tokens: int = 1024,
    temperature: float = 0.7,
    tools: list[dict] | None = None,
    extra: dict | None = None,
    provider: Provider | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """Stream with EOS biasing for response_length_limit."""
    limit = provider.response_length_limit if provider else None
    token_count = 0

    async for chunk in call_openai_chat_stream(
        messages=messages,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        tools=tools,
        extra=extra,
        provider=provider,
    ):
        if chunk.get("_done"):
            yield chunk
            return

        if limit is not None:
            for choice in chunk.get("choices", []):
                content = extract_content_delta(choice)
                if content:
                    token_count += 1
                    if token_count >= limit:
                        choice["finish_reason"] = "length"
                        choice["delta"]["content"] = ""
                        yield chunk
                        yield {"_done": True}
                        return

        yield chunk

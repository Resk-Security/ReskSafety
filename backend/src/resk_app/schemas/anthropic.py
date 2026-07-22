"""Anthropic Messages API schemas for /v1/messages endpoint."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AnthropicMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str | list[dict] = ""


class AnthropicRequest(BaseModel):
    model: str
    max_tokens: int = 1024
    messages: list[AnthropicMessage] = Field(..., min_length=1)
    system: str | list[dict] | None = None
    temperature: float | None = None
    top_k: int | None = None
    top_p: float | None = None
    stream: bool = False
    stop_sequences: list[str] | None = None
    metadata: dict[str, Any] = {}
    extra: dict[str, Any] = {}

    model_config = {"extra": "allow"}


class AnthropicContentBlock(BaseModel):
    type: str = "text"
    text: str = ""


class AnthropicUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0


class AnthropicResponse(BaseModel):
    id: str
    type: str = "message"
    role: str = "assistant"
    content: list[AnthropicContentBlock] = []
    model: str
    stop_reason: str | None = None
    stop_sequence: str | None = None
    usage: AnthropicUsage = AnthropicUsage()
    blocked: bool = False
    blocked_phrase: str | None = None


class OpenAICompatibleModel(BaseModel):
    id: str
    object: str = "model"
    created: int = 0
    owned_by: str = "resk"


class OpenAIModelListResponse(BaseModel):
    object: str = "list"
    data: list[OpenAICompatibleModel] = []

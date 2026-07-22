"""Firewall (public LLM API) schemas - OpenAI-compatible subset."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str
    content: str | None = None
    name: str | None = None
    tool_calls: list[dict] | None = None
    tool_call_id: str | None = None


class ChatCompletionRequest(BaseModel):
    model: str | None = None
    messages: list[ChatMessage] = Field(..., min_length=1)
    max_tokens: int | None = 1024
    temperature: float | None = 0.7
    stream: bool | None = False
    tools: list[dict] | None = None
    session_id: str | None = None
    extra: dict[str, Any] = {}

    model_config = {"extra": "allow"}


class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: list[dict]
    usage: dict | None = None
    blocked: bool = False
    blocked_phrase: str | None = None


class BatchToolCallRequest(BaseModel):
    model: str | None = None
    tool_calls: list[dict] = Field(..., min_length=1)
    messages: list[ChatMessage] = Field(default_factory=list)


class TokenizeRequest(BaseModel):
    model: str | None = None
    text: str = Field(..., min_length=1)


class TokenizeResponse(BaseModel):
    tokens: list[int]
    blocked_tokens: list[int]
    blocked_phrases: list[str]
    model: str | None = None


class OpenAIModelEntry(BaseModel):
    id: str
    object: str = "model"
    created: int = 0
    owned_by: str = "resk"


class OpenAIModelListResponse(BaseModel):
    object: str = "list"
    data: list[OpenAIModelEntry] = []

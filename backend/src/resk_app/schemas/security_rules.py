from __future__ import annotations

from pydantic import BaseModel, Field


class FileOperationRule(BaseModel):
    max_file_size_bytes: int = Field(default=102_400, ge=0)  # 100 KB
    max_lines: int = Field(default=1000, ge=0)
    max_line_length_chars: int = Field(default=2000, ge=0)
    require_absolute_path: bool = True


class ShellCommandRule(BaseModel):
    min_timeout_sec: int = Field(default=1, ge=1)
    max_timeout_sec: int = Field(default=300, le=300)
    require_approval: bool = True
    allow_streaming_output: bool = True


class ErrorClassRule(BaseModel):
    retryable_codes: list[int] = Field(default_factory=lambda: [408, 429, 500, 502, 503, 504])
    non_retryable_codes: list[int] = Field(default_factory=lambda: [400, 401, 403, 404, 413])

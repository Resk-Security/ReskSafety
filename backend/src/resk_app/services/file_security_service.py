"""File operations security validator.

Rules:
- Absolute paths required (no path traversal)
- 100 KB max per file read
- 1000 lines max
- 2000 chars max per line
"""

from __future__ import annotations

import os
from pathlib import Path

from resk_app.schemas.security_rules import FileOperationRule


class FileSecurityError(Exception):
    pass


DEFAULT_RULES = FileOperationRule()


def validate_read_path(path: str, rules: FileOperationRule | None = None) -> Path:
    r = rules or DEFAULT_RULES

    p = Path(path)

    if r.require_absolute_path and not p.is_absolute():
        raise FileSecurityError("Only absolute paths allowed")

    resolved = p.resolve()
    if ".." in str(p) or ".." in str(resolved.relative_to(resolved.anchor)):
        raise FileSecurityError("Path traversal detected")

    return resolved


def validate_file_content(content: str, rules: FileOperationRule | None = None) -> None:
    r = rules or DEFAULT_RULES

    if r.max_file_size_bytes > 0 and len(content.encode("utf-8")) > r.max_file_size_bytes:
        raise FileSecurityError(f"File exceeds {r.max_file_size_bytes} bytes")

    lines = content.splitlines()
    if r.max_lines > 0 and len(lines) > r.max_lines:
        raise FileSecurityError(f"File exceeds {r.max_lines} lines")

    if r.max_line_length_chars > 0:
        for i, line in enumerate(lines, 1):
            if len(line) > r.max_line_length_chars:
                raise FileSecurityError(f"Line {i} exceeds {r.max_line_length_chars} characters")


def safe_read_file(path: str, rules: FileOperationRule | None = None) -> str:
    r = rules or DEFAULT_RULES
    resolved = validate_read_path(path, r)

    if not resolved.exists():
        raise FileSecurityError(f"File not found: {path}")
    if not resolved.is_file():
        raise FileSecurityError(f"Not a file: {path}")

    try:
        content = resolved.read_text(encoding="utf-8", errors="replace")
    except PermissionError:
        raise FileSecurityError(f"Permission denied: {path}")
    except OSError as exc:
        raise FileSecurityError(f"Read error: {exc}")

    validate_file_content(content, r)
    return content

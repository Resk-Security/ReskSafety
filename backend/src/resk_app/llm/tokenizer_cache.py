"""Tokenizer cache: loads HuggingFace tokenizers on demand by model name."""

from __future__ import annotations

import threading
from typing import Any

from resk_app.schemas.settings import ModelTokenizerConfig

_lock = threading.RLock()
_cache: dict[str, Any] = {}


def get_tokenizer(name: str, config: ModelTokenizerConfig | None = None) -> Any | None:
    """Load and cache a tokenizer. Applies per-model overrides if provided.

    Returns None if 'transformers' is not installed (distant-only mode).
    """
    if not name:
        return None
    effective_name = config.tokenizer_name if config and config.tokenizer_name else name
    with _lock:
        if effective_name in _cache:
            return _cache[effective_name]
    try:
        from transformers import AutoTokenizer  # type: ignore
    except Exception:
        return None
    try:
        tok = AutoTokenizer.from_pretrained(
            effective_name,
            trust_remote_code=config.trust_remote_code if config else False,
        )
    except Exception:
        return None
    if config and config.add_prefix_space and hasattr(tok, "add_prefix_space"):
        tok.add_prefix_space = True
    if config and config.custom_special_tokens:
        extras = [t for t in config.custom_special_tokens if t not in tok.additional_special_tokens]
        if extras:
            tok.add_special_tokens({"additional_special_tokens": extras})
    with _lock:
        _cache[effective_name] = tok
    return tok


def get_special_token_info(name: str, config: ModelTokenizerConfig | None = None) -> dict[str, Any]:
    """Load the tokenizer and return detected special tokens + IDs."""
    tok = get_tokenizer(name, config)
    if tok is None:
        return {"detected_special_tokens": {}, "detected_special_token_ids": []}
    special: dict[str, str] = {}
    for attr in ("bos_token", "eos_token", "pad_token", "unk_token", "sep_token", "cls_token", "mask_token"):
        val = getattr(tok, attr, None)
        if val is not None:
            special[attr] = str(val)
    ids: list[int] = []
    for sid in getattr(tok, "all_special_ids", None) or []:
        if isinstance(sid, int):
            ids.append(sid)
    return {"detected_special_tokens": special, "detected_special_token_ids": ids}


def clear() -> None:
    with _lock:
        _cache.clear()

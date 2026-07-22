"""Bridge between Policy rules and resklogits processors.

Responsibilities:
- Flatten policy rules into a list of banned phrases.
- Instantiate VectorizedAhoCorasick / ShadowBanProcessor / BanTokenProcessor.
- Provide a pure-Python post-filter fallback for distant LLM backends
  (OpenAI) where logits cannot be intercepted.

If `resklogits` is not installed (dev mode), falls back to a naive
substring scanner so the app still works for testing.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class CompiledPolicy:
    """Compiled, backend-agnostic representation of a policy."""

    banned_phrases: list[str]
    biased_phrases: list[tuple[str, float]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "banned_phrases": self.banned_phrases,
            "biased_phrases": self.biased_phrases,
        }


def compile_policy(logit_rules: list[dict]) -> CompiledPolicy:
    """Flatten rules into hard-banned and biased phrase lists."""
    banned: list[str] = []
    biased: list[tuple[str, float]] = []
    for rule in logit_rules or []:
        mode = (rule.get("mode") or "hard").lower()
        penalty = float(rule.get("penalty", 10.0))
        phrases = rule.get("phrases") or []
        if mode == "bias":
            for p in phrases:
                biased.append((p, penalty))
        else:
            banned.extend(phrases)
    return CompiledPolicy(
        banned_phrases=banned,
        biased_phrases=biased,
    )


def build_processor_from_policy(
    compiled: CompiledPolicy,
    tokenizer: Any,
    device: str = "cuda",
) -> Any | None:
    """Build a resklogits logits processor for local generation.

    Returns None if resklogits is unavailable or no phrases are set.
    """
    try:
        from resklogits import ShadowBanProcessor  # type: ignore
    except Exception:
        return None
    phrases = list(compiled.banned_phrases)
    for p, _ in compiled.biased_phrases:
        phrases.append(p)
    if not phrases or tokenizer is None:
        return None
    return ShadowBanProcessor(
        tokenizer=tokenizer,
        banned_phrases=phrases,
        shadow_penalty=-15.0,
        device=device,
    )


def build_processor_from_policy_with_penalty(
    compiled: CompiledPolicy,
    tokenizer,
    device: str = "cpu",
    shadow_penalty: float = -15.0,
    protected_token_ids: list[int] | None = None,
):
    """Build a resklogits logits processor with configurable penalty.

    *protected_token_ids* — token IDs that should never be blocked
    (e.g. special tokens like BOS, EOS, PAD).
    """
    try:
        from resklogits import ShadowBanProcessor  # type: ignore
    except Exception:
        return None
    phrases = list(compiled.banned_phrases)
    for p, _ in compiled.biased_phrases:
        phrases.append(p)
    if not phrases or tokenizer is None:
        return None
    kwargs: dict = {
        "tokenizer": tokenizer,
        "banned_phrases": phrases,
        "shadow_penalty": shadow_penalty,
        "device": device,
    }
    if protected_token_ids is not None:
        kwargs["protected_token_ids"] = protected_token_ids
    return ShadowBanProcessor(**kwargs)


def build_aho_corasick(compiled: CompiledPolicy, tokenizer: Any) -> Any | None:
    """Build a VectorizedAhoCorasick scanner for post-filtering."""
    try:
        from resklogits import VectorizedAhoCorasick  # type: ignore
    except Exception:
        return None
    phrases = list(compiled.banned_phrases)
    if not phrases or tokenizer is None:
        return None
    return VectorizedAhoCorasick(tokenizer, phrases, device="cpu")


def post_filter_text(text: str, compiled: CompiledPolicy) -> str | None:
    """Naive substring scan for distant backends. Returns matched phrase or None.

    Used when no tokenizer/aho-corasick is available. Case-insensitive.
    """
    if not text:
        return None
    lower = text.lower()
    for phrase in compiled.banned_phrases:
        if phrase and phrase.lower() in lower:
            return phrase
    return None

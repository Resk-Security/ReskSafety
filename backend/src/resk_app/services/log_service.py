"""Log service: writes RequestLog, optionally hashing prompts."""

from __future__ import annotations

import hashlib
import uuid
from typing import Any

from sqlalchemy.orm import Session

from resk_app.config import get_settings
from resk_app.models.log import RequestLog


def log_request(
    db: Session,
    *,
    user_id: uuid.UUID | None,
    policy_id: uuid.UUID | None,
    status: str,
    backend_type: str,
    model: str,
    blocked_phrase: str | None = None,
    prompt: str | None = None,
    extra: dict[str, Any] | None = None,
) -> RequestLog:
    settings = get_settings()
    prompt_hash = None
    if prompt:
        if settings.LOG_PROMPTS:
            extra = dict(extra or {})
            extra["prompt"] = prompt[:2000]
        prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    entry = RequestLog(
        user_id=user_id,
        policy_id=policy_id,
        status=status,
        backend_type=backend_type,
        model=model,
        blocked_phrase=blocked_phrase,
        prompt_hash=prompt_hash,
        extra=extra,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry

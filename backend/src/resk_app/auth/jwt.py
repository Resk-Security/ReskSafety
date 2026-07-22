"""JWT encode/decode for admin and user tokens.

Claims:
    - sub: user id (str)
    - username: str
    - is_admin: bool
    - capabilities_mask: int
    - csrf: CSRF token (double-submit cookie pattern)
    - type: "admin" | "user"
    - exp, iat
"""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from resk_app.config import get_settings


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_jwt(
    user_id: uuid.UUID,
    username: str,
    is_admin: bool,
    capabilities_mask: int,
    token_type: str = "user",
    ttl_minutes: int | None = None,
) -> tuple[str, str]:
    """Return (jwt_token, csrf_token)."""
    settings = get_settings()
    ttl = ttl_minutes if ttl_minutes is not None else settings.JWT_TTL_MIN
    csrf = secrets.token_urlsafe(32)
    now = _now()
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "username": username,
        "is_admin": is_admin,
        "capabilities_mask": int(capabilities_mask),
        "csrf": csrf,
        "type": token_type,
        "iat": now,
        "exp": now + timedelta(minutes=ttl),
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, csrf


def create_refresh_token(user_id: uuid.UUID, username: str) -> str:
    settings = get_settings()
    now = _now()
    payload = {
        "sub": str(user_id),
        "username": username,
        "type": "refresh",
        "iat": now,
        "exp": now + timedelta(days=settings.JWT_REFRESH_TTL_DAYS),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_jwt(token: str) -> dict[str, Any]:
    settings = get_settings()
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])

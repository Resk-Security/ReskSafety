"""Cookie helpers for httpOnly admin/user JWT."""

from __future__ import annotations

from fastapi import Response

from resk_app.config import get_settings

ADMIN_COOKIE = "admin_token"
USER_COOKIE = "user_token"
CSRF_COOKIE = "csrf_token"


def set_auth_cookie(
    response: Response,
    token: str,
    csrf: str,
    cookie_name: str = ADMIN_COOKIE,
    max_age: int | None = None,
) -> None:
    settings = get_settings()
    ttl = max_age if max_age is not None else settings.JWT_TTL_MIN * 60
    response.set_cookie(
        key=cookie_name,
        value=token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="strict",
        max_age=ttl,
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE,
        value=csrf,
        httponly=False,  # readable by frontend for double-submit
        secure=settings.COOKIE_SECURE,
        samesite="strict",
        max_age=ttl,
        path="/",
    )


def clear_auth_cookie(response: Response, cookie_name: str = ADMIN_COOKIE) -> None:
    response.delete_cookie(key=cookie_name, path="/")
    response.delete_cookie(key=CSRF_COOKIE, path="/")

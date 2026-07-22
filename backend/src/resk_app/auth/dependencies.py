"""FastAPI auth dependencies: current admin, current user, CSRF verification."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from resk_app.auth.cookies import ADMIN_COOKIE, CSRF_COOKIE, USER_COOKIE
from resk_app.auth.jwt import decode_jwt
from resk_app.db.session import get_db
from resk_app.models.user import User


def _load_user_from_token(token: str, db: Session, expected_type: str) -> User:
    try:
        payload = decode_jwt(token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc
    if payload.get("type") != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Wrong token type",
        )
    try:
        user_id = uuid.UUID(str(payload["sub"]))
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
        ) from exc
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user, payload


def _verify_csrf(
    csrf_cookie: str | None,
    x_csrf_token: str | None,
    jwt_payload: dict | None = None,
) -> None:
    if not csrf_cookie or not x_csrf_token or csrf_cookie != x_csrf_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF validation failed",
        )
    if jwt_payload and jwt_payload.get("csrf") and jwt_payload["csrf"] != csrf_cookie:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token does not match JWT",
        )


def get_current_admin(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    admin_token: Annotated[str | None, Cookie(alias=ADMIN_COOKIE)] = None,
    csrf_token: Annotated[str | None, Cookie(alias=CSRF_COOKIE)] = None,
    x_csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> User:
    if not admin_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        try:
            payload = decode_jwt(admin_token)
        except Exception:
            payload = None
        _verify_csrf(csrf_token, x_csrf_token, payload)
    user = _load_user_from_token(admin_token, db, "admin")[0]
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    user_token: Annotated[str | None, Cookie(alias=USER_COOKIE)] = None,
    admin_token: Annotated[str | None, Cookie(alias=ADMIN_COOKIE)] = None,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> User:
    """Public firewall endpoint: accept Bearer JWT, user cookie, or admin cookie."""
    token: str | None = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif user_token:
        token = user_token
    elif admin_token:
        token = admin_token
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        return _load_user_from_token(token, db, "user")[0]
    except HTTPException:
        pass
    return _load_user_from_token(token, db, "admin")[0]


CurrentUser = User
CurrentAdmin = User

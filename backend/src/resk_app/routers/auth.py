"""Auth router: login, logout, me, refresh."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from resk_app.auth.cookies import ADMIN_COOKIE, USER_COOKIE, clear_auth_cookie, set_auth_cookie
from resk_app.auth.dependencies import CurrentAdmin, get_current_admin
from resk_app.auth.jwt import create_jwt
from resk_app.auth.passwords import verify_password
from resk_app.config import get_settings
from resk_app.db.session import get_db
from resk_app.limiter import limiter
from resk_app.models.user import User
from resk_app.rbac import compute_user_mask, active_bits
from resk_app.schemas.auth import LoginRequest, UserMeResponse, UserTokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_me(user: User) -> UserMeResponse:
    mask = compute_user_mask(user)
    return UserMeResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        is_admin=user.is_admin,
        capabilities_mask=mask,
        active_bits=active_bits(mask),
    )


@router.post("/register", status_code=403)
def register() -> dict:
    raise HTTPException(status_code=403, detail="Registration disabled on demo")


@router.post("/login")
@limiter.limit("10/minute")
def login(
    request: Request,
    body: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> dict:
    user = db.scalar(select(User).where(User.username == body.username))
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    if not user.is_active or not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    mask = compute_user_mask(user)
    token, csrf = create_jwt(user.id, user.username, True, mask, token_type="admin")
    set_auth_cookie(response, token, csrf, cookie_name=ADMIN_COOKIE)
    return {
        "token_type": "bearer",
        "csrf_token": csrf,
        "expires_in": get_settings().JWT_TTL_MIN * 60,
        "user": _user_me(user).model_dump(),
    }


@router.post("/user-login", response_model=UserTokenResponse)
@limiter.limit("10/minute")
def user_login(
    request: Request,
    body: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> UserTokenResponse:
    user = db.scalar(select(User).where(User.username == body.username))
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    mask = compute_user_mask(user)
    token, csrf = create_jwt(user.id, user.username, user.is_admin, mask, token_type="user")
    set_auth_cookie(response, token, csrf, cookie_name=USER_COOKIE)
    return UserTokenResponse(
        access_token=token,
        expires_in=get_settings().JWT_TTL_MIN * 60,
    )


@router.post("/logout")
def logout(response: Response):
    clear_auth_cookie(response, cookie_name=ADMIN_COOKIE)
    return {"detail": "logged out"}


@router.get("/me")
def me(current: CurrentAdmin = Depends(get_current_admin)) -> UserMeResponse:
    return _user_me(current)


@router.post("/refresh")
def refresh(
    response: Response,
    current: CurrentAdmin = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> dict:
    user = db.get(User, current.id)
    if user is None:
        raise HTTPException(status_code=404, detail="User gone")
    mask = compute_user_mask(user)
    token, csrf = create_jwt(user.id, user.username, True, mask, token_type="admin")
    set_auth_cookie(response, token, csrf, cookie_name=ADMIN_COOKIE)
    return {
        "token_type": "bearer",
        "csrf_token": csrf,
        "expires_in": get_settings().JWT_TTL_MIN * 60,
    }

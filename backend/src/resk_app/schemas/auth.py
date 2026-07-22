"""Auth-related schemas."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    email: EmailStr
    password: str = Field(..., min_length=8)


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=8)


class TokenResponse(BaseModel):
    token_type: str = "bearer"
    csrf_token: str
    expires_in: int
    user: "UserMeResponse"


class UserTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserMeResponse(BaseModel):
    id: str
    username: str
    email: EmailStr
    is_admin: bool
    capabilities_mask: int
    active_bits: list[int] = []


from resk_app.schemas.user import UserOut  # noqa: E402, F401  (for forward refs)

TokenResponse.model_rebuild()

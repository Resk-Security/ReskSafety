"""User CRUD + computed mask endpoint."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from resk_app.auth.dependencies import CurrentAdmin, get_current_admin
from resk_app.db.session import get_db
from resk_app.models.role import Role
from resk_app.models.session import AgentSession
from resk_app.models.user import User
from resk_app.auth.passwords import hash_password
from resk_app.rbac import active_bits, compute_user_mask
from resk_app.schemas.role import RoleOut
from resk_app.schemas.user import UserCreate, UserOut, UserUpdate, UserWithMask

router = APIRouter(prefix="/api/users", tags=["users"])


def _load_roles(db: Session, role_ids: list[uuid.UUID]) -> list[Role]:
    roles: list[Role] = []
    for rid in role_ids:
        r = db.get(Role, rid)
        if r is None:
            raise HTTPException(status_code=404, detail=f"Role {rid} not found")
        roles.append(r)
    return roles


def _user_with_mask(user: User) -> UserWithMask:
    mask = compute_user_mask(user)
    return UserWithMask(
        id=user.id,
        username=user.username,
        email=user.email,
        is_admin=user.is_admin,
        capabilities_mask=mask,
        active_bits=active_bits(mask),
        roles=[
            RoleOut(
                id=r.id,
                name=r.name,
                description=r.description,
                capabilities_mask=r.capabilities_mask,
                active_bits=active_bits(r.capabilities_mask),
            )
            for r in user.roles
        ],
    )


@router.get("")
def list_users(
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> list[UserOut]:
    users_list = db.scalars(select(User).order_by(User.created_at.desc())).all()
    result = []
    for user in users_list:
        out = UserOut.model_validate(user)
        session_count = db.scalar(
            select(func.count(AgentSession.id)).where(AgentSession.user_id == user.id)
        ) or 0
        token_count = db.scalar(
            select(func.coalesce(func.sum(AgentSession.tokens_in + AgentSession.tokens_out), 0))
            .where(AgentSession.user_id == user.id)
        ) or 0
        out_dict = out.model_dump()
        out_dict["session_count"] = session_count
        out_dict["total_tokens"] = token_count
        result.append(out_dict)
    return result


@router.post("", status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> UserOut:
    if db.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(status_code=409, detail="Username exists")
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(status_code=409, detail="Email exists")
    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        is_active=body.is_active,
        is_admin=body.is_admin,
    )
    user.roles = _load_roles(db, body.role_ids)
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.get("/{user_id}")
def get_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> UserWithMask:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_with_mask(user)


@router.get("/{user_id}/mask")
def get_user_mask(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> dict:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    mask = compute_user_mask(user)
    return {
        "user_id": str(user.id),
        "username": user.username,
        "capabilities_mask": mask,
        "active_bits": active_bits(mask),
    }


@router.put("/{user_id}")
def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> UserOut:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if body.username is not None:
        user.username = body.username
    if body.email is not None:
        user.email = body.email
    if body.password is not None:
        user.hashed_password = hash_password(body.password)
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.is_admin is not None:
        user.is_admin = body.is_admin
    if body.role_ids is not None:
        user.roles = _load_roles(db, body.role_ids)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()

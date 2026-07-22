"""Role CRUD + policy association."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from resk_app.auth.dependencies import CurrentAdmin, get_current_admin
from resk_app.db.session import get_db
from resk_app.models.policy import Policy
from resk_app.models.role import Role
from resk_app.rbac import active_bits
from resk_app.schemas.role import RoleCreate, RoleOut, RoleUpdate

router = APIRouter(prefix="/api/roles", tags=["roles"])


def _out(r: Role) -> RoleOut:
    return RoleOut(
        id=r.id,
        name=r.name,
        description=r.description,
        capabilities_mask=r.capabilities_mask,
        active_bits=active_bits(r.capabilities_mask),
        mcp_tool_allowlist=r.mcp_tool_allowlist if isinstance(r.mcp_tool_allowlist, list) else None,
    )


def _load_policies(db: Session, ids: list[uuid.UUID]) -> list[Policy]:
    out: list[Policy] = []
    for pid in ids:
        p = db.get(Policy, pid)
        if p is None:
            raise HTTPException(status_code=404, detail=f"Policy {pid} not found")
        out.append(p)
    return out


@router.get("")
def list_roles(
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> list[RoleOut]:
    roles = db.scalars(select(Role).order_by(Role.name)).all()
    return [_out(r) for r in roles]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_role(
    body: RoleCreate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> RoleOut:
    if db.scalar(select(Role).where(Role.name == body.name)):
        raise HTTPException(status_code=409, detail="Role name exists")
    role = Role(
        name=body.name,
        description=body.description,
        capabilities_mask=body.capabilities_mask,
        mcp_tool_allowlist=body.mcp_tool_allowlist,
    )
    role.policies = _load_policies(db, body.policy_ids)
    db.add(role)
    db.commit()
    db.refresh(role)
    return _out(role)


@router.put("/{role_id}")
def update_role(
    role_id: uuid.UUID,
    body: RoleUpdate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> RoleOut:
    role = db.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    if body.name is not None:
        role.name = body.name
    if body.description is not None:
        role.description = body.description
    if body.capabilities_mask is not None:
        role.capabilities_mask = body.capabilities_mask
    if body.policy_ids is not None:
        role.policies = _load_policies(db, body.policy_ids)
    if body.mcp_tool_allowlist is not None:
        role.mcp_tool_allowlist = body.mcp_tool_allowlist
    db.commit()
    db.refresh(role)
    return _out(role)


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    role_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> None:
    role = db.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    db.delete(role)
    db.commit()


@router.post("/{role_id}/policy")
def attach_policy(
    role_id: uuid.UUID,
    policy_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> RoleOut:
    role = db.get(Role, role_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    policy = db.get(Policy, policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail="Policy not found")
    if policy not in role.policies:
        role.policies.append(policy)
        db.commit()
        db.refresh(role)
    return _out(role)

"""Hooks router: lifecycle hook CRUD and execution."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from resk_app.auth.dependencies import CurrentAdmin, get_current_admin
from resk_app.db.session import get_db
from resk_app.models.hook import Hook
from resk_app.schemas.hook import HookIn, HookOut, HookUpdate
from resk_app.services.hook_service import execute_hook

router = APIRouter(prefix="/api/hooks", tags=["hooks"])


@router.get("", response_model=list[HookOut])
def list_hooks(
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    hooks = db.execute(select(Hook).order_by(Hook.name)).scalars().all()
    return [_to_out(h) for h in hooks]


@router.get("/{hook_id}", response_model=HookOut)
def get_hook(
    hook_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    hook = db.get(Hook, hook_id)
    if not hook:
        raise HTTPException(status_code=404, detail="Hook not found")
    return _to_out(hook)


@router.post("", response_model=HookOut, status_code=201)
def create_hook(
    data: HookIn,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    if db.execute(select(Hook).where(Hook.name == data.name)).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Hook name exists")
    hook = Hook(
        name=data.name,
        hook_type=data.hook_type,
        command=data.command,
        timeout_sec=data.timeout_sec,
        action=data.action,
        is_active=data.is_active,
    )
    db.add(hook)
    db.commit()
    db.refresh(hook)
    return _to_out(hook)


@router.put("/{hook_id}", response_model=HookOut)
def update_hook(
    hook_id: uuid.UUID,
    data: HookUpdate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    hook = db.get(Hook, hook_id)
    if not hook:
        raise HTTPException(status_code=404, detail="Hook not found")
    if data.name is not None:
        hook.name = data.name
    if data.hook_type is not None:
        hook.hook_type = data.hook_type
    if data.command is not None:
        hook.command = data.command
    if data.timeout_sec is not None:
        hook.timeout_sec = data.timeout_sec
    if data.action is not None:
        hook.action = data.action
    if data.is_active is not None:
        hook.is_active = data.is_active
    db.commit()
    db.refresh(hook)
    return _to_out(hook)


@router.delete("/{hook_id}", status_code=204)
def delete_hook(
    hook_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    hook = db.get(Hook, hook_id)
    if not hook:
        raise HTTPException(status_code=404, detail="Hook not found")
    db.delete(hook)
    db.commit()


@router.post("/{hook_id}/test")
async def test_hook(
    hook_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    hook = db.get(Hook, hook_id)
    if not hook:
        raise HTTPException(status_code=404, detail="Hook not found")
    result = await execute_hook(hook)
    return result.to_dict()


def _to_out(h: Hook) -> HookOut:
    return HookOut(
        id=h.id,
        name=h.name,
        hook_type=h.hook_type,
        command=h.command,
        timeout_sec=h.timeout_sec,
        action=h.action,
        is_active=h.is_active,
        created_at=h.created_at,
        updated_at=h.updated_at,
    )

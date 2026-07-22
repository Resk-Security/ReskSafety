"""PolicyConfig CRUD — standalone, reusable SD / ACL / Classifier configs."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from resk_app.auth.dependencies import CurrentAdmin, get_current_admin
from resk_app.db.session import get_db
from resk_app.models.policy_config import PolicyConfig
from resk_app.schemas.policy_config import (
    PolicyConfigCreate,
    PolicyConfigOut,
    PolicyConfigUpdate,
)

router = APIRouter(prefix="/api/policy-configs", tags=["policy-configs"])


def _out(c: PolicyConfig) -> PolicyConfigOut:
    return PolicyConfigOut(
        id=c.id,
        name=c.name,
        description=c.description,
        config_type=c.config_type,
        config=c.config,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


@router.get("")
def list_configs(
    config_type: str | None = Query(None, alias="type"),
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> list[PolicyConfigOut]:
    stmt = select(PolicyConfig).order_by(PolicyConfig.name)
    if config_type:
        stmt = stmt.where(PolicyConfig.config_type == config_type)
    items = db.scalars(stmt).all()
    return [_out(c) for c in items]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_config(
    body: PolicyConfigCreate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> PolicyConfigOut:
    c = PolicyConfig(
        name=body.name,
        description=body.description,
        config_type=body.config_type,
        config=body.config,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _out(c)


@router.get("/{config_id}")
def get_config(
    config_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> PolicyConfigOut:
    c = db.get(PolicyConfig, config_id)
    if c is None:
        raise HTTPException(status_code=404, detail="PolicyConfig not found")
    return _out(c)


@router.put("/{config_id}")
def update_config(
    config_id: uuid.UUID,
    body: PolicyConfigUpdate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> PolicyConfigOut:
    c = db.get(PolicyConfig, config_id)
    if c is None:
        raise HTTPException(status_code=404, detail="PolicyConfig not found")
    if body.name is not None:
        c.name = body.name
    if body.description is not None:
        c.description = body.description
    if body.config is not None:
        c.config = body.config
    db.commit()
    db.refresh(c)
    return _out(c)


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_config(
    config_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> None:
    c = db.get(PolicyConfig, config_id)
    if c is None:
        raise HTTPException(status_code=404, detail="PolicyConfig not found")
    db.delete(c)
    db.commit()

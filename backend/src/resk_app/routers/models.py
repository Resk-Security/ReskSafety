from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from resk_app.auth.dependencies import CurrentAdmin, get_current_admin
from resk_app.db.session import get_db
from resk_app.schemas.hook import ModelSecurityInfo, ModelSecurityPolicyIn
from resk_app.schemas.model import ModelIn, ModelOut, ModelUpdate
from resk_app.services import model_service, security_visibility_service

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("", response_model=list[ModelOut])
def list_models(
    provider_id: uuid.UUID | None = Query(None),
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    return model_service.list_models(db, provider_id=provider_id)


@router.get("/{model_id}", response_model=ModelOut)
def get_model(
    model_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    m = model_service.get_model(db, model_id)
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")
    return model_service._to_out(m)


@router.post("", response_model=ModelOut, status_code=201)
def create_model(
    data: ModelIn,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    return model_service.create_model(db, data)


@router.put("/{model_id}", response_model=ModelOut)
def update_model(
    model_id: uuid.UUID,
    data: ModelUpdate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    m = model_service.get_model(db, model_id)
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")
    return model_service.update_model(db, m, data)


@router.delete("/{model_id}", status_code=204)
def delete_model(
    model_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    m = model_service.get_model(db, model_id)
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")
    model_service.delete_model(db, m)


# ── Security visibility ──

@router.get("/{model_id}/security", response_model=ModelSecurityInfo)
def get_model_security(
    model_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    try:
        return security_visibility_service.get_security_for_model(db, model_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/{model_id}/security/policies", status_code=201)
def attach_policy_to_model(
    model_id: uuid.UUID,
    data: ModelSecurityPolicyIn,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    m = model_service.get_model(db, model_id)
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")
    msp = security_visibility_service.attach_policy_to_model(db, model_id, data.policy_id, data.hook_id)
    return {"model_id": str(msp.model_id), "policy_id": str(msp.policy_id), "hook_id": str(msp.hook_id) if msp.hook_id else None}


@router.delete("/{model_id}/security/policies/{policy_id}", status_code=204)
def detach_policy_from_model(
    model_id: uuid.UUID,
    policy_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    security_visibility_service.detach_policy_from_model(db, model_id, policy_id)

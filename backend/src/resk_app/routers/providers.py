from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from resk_app.auth.dependencies import CurrentAdmin, get_current_admin
from resk_app.db.session import get_db
from resk_app.schemas.model import ModelOut
from resk_app.schemas.provider import ProviderIn, ProviderOut, ProviderTestResult, ProviderUpdate
from resk_app.services import model_service, provider_service

router = APIRouter(prefix="/api/providers", tags=["providers"])


@router.get("", response_model=list[ProviderOut])
def list_providers(
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    return provider_service.list_providers(db)


@router.get("/{provider_id}", response_model=ProviderOut)
def get_provider(
    provider_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    p = provider_service.get_provider(db, provider_id)
    if not p:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider_service._to_out(p)


@router.post("", response_model=ProviderOut, status_code=201)
def create_provider(
    data: ProviderIn,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    return provider_service.create_provider(db, data)


@router.put("/{provider_id}", response_model=ProviderOut)
def update_provider(
    provider_id: uuid.UUID,
    data: ProviderUpdate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    p = provider_service.get_provider(db, provider_id)
    if not p:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider_service.update_provider(db, p, data)


@router.delete("/{provider_id}", status_code=204)
def delete_provider(
    provider_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    p = provider_service.get_provider(db, provider_id)
    if not p:
        raise HTTPException(status_code=404, detail="Provider not found")
    provider_service.delete_provider(db, p)


@router.get("/{provider_id}/models", response_model=list[ModelOut])
def list_provider_models(
    provider_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    p = provider_service.get_provider(db, provider_id)
    if not p:
        raise HTTPException(status_code=404, detail="Provider not found")
    return model_service.list_models(db, provider_id=provider_id)


@router.post("/{provider_id}/test", response_model=ProviderTestResult)
def test_provider(
    provider_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    p = provider_service.get_provider(db, provider_id)
    if not p:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider_service.test_provider(db, p)
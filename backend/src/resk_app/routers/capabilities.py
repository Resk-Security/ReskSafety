"""Capability CRUD (editable bitmask labels)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from resk_app.auth.dependencies import CurrentAdmin, get_current_admin
from resk_app.db.session import get_db
from resk_app.models.capability import Capability
from resk_app.schemas.capability import CapabilityCreate, CapabilityOut

router = APIRouter(prefix="/api/capabilities", tags=["capabilities"])


@router.get("")
def list_capabilities(
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> list[CapabilityOut]:
    items = db.scalars(select(Capability).order_by(Capability.bit_position)).all()
    return [CapabilityOut.model_validate(c) for c in items]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_capability(
    body: CapabilityCreate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> CapabilityOut:
    if db.get(Capability, body.bit_position):
        raise HTTPException(status_code=409, detail="Bit position already used")
    if db.scalar(select(Capability).where(Capability.name == body.name)):
        raise HTTPException(status_code=409, detail="Name exists")
    cap = Capability(
        bit_position=body.bit_position,
        name=body.name,
        description=body.description,
    )
    db.add(cap)
    db.commit()
    db.refresh(cap)
    return CapabilityOut.model_validate(cap)


@router.put("/{bit_position}")
def update_capability(
    bit_position: int,
    body: CapabilityCreate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> CapabilityOut:
    cap = db.get(Capability, bit_position)
    if cap is None:
        raise HTTPException(status_code=404, detail="Capability not found")
    cap.name = body.name
    cap.description = body.description
    db.commit()
    db.refresh(cap)
    return CapabilityOut.model_validate(cap)


@router.delete("/{bit_position}", status_code=status.HTTP_204_NO_CONTENT)
def delete_capability(
    bit_position: int,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> None:
    cap = db.get(Capability, bit_position)
    if cap is None:
        raise HTTPException(status_code=404, detail="Capability not found")
    db.delete(cap)
    db.commit()

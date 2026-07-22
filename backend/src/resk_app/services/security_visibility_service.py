"""Service to map security policies to models and expose security info."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from resk_app.models.hook import Hook, ModelSecurityPolicy
from resk_app.models.model import Model
from resk_app.schemas.hook import ModelSecurityInfo


def get_security_for_model(db: Session, model_id: uuid.UUID) -> ModelSecurityInfo:
    model = db.get(Model, model_id)
    if not model:
        raise ValueError("Model not found")

    rows = db.execute(
        select(ModelSecurityPolicy, Hook)
        .outerjoin(Hook, ModelSecurityPolicy.hook_id == Hook.id)
        .where(ModelSecurityPolicy.model_id == model_id)
    ).all()

    policies_list = []
    hooks_list = []
    for msp, hook in rows:
        policies_list.append({"policy_id": str(msp.policy_id), "hook_id": str(msp.hook_id) if msp.hook_id else None})
        if hook:
            hooks_list.append({"id": str(hook.id), "name": hook.name, "type": hook.hook_type, "action": hook.action})

    return ModelSecurityInfo(
        model_id=model.id,
        model_name=model.name,
        policies=policies_list,
        hooks=hooks_list,
    )


def attach_policy_to_model(db: Session, model_id: uuid.UUID, policy_id: uuid.UUID, hook_id: uuid.UUID | None = None) -> ModelSecurityPolicy:
    from fastapi import HTTPException, status

    existing = db.execute(
        select(ModelSecurityPolicy).where(
            ModelSecurityPolicy.model_id == model_id,
            ModelSecurityPolicy.policy_id == policy_id,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Policy already attached to model")

    msp = ModelSecurityPolicy(model_id=model_id, policy_id=policy_id, hook_id=hook_id)
    db.add(msp)
    db.commit()
    return msp


def detach_policy_from_model(db: Session, model_id: uuid.UUID, policy_id: uuid.UUID) -> None:
    msp = db.execute(
        select(ModelSecurityPolicy).where(
            ModelSecurityPolicy.model_id == model_id,
            ModelSecurityPolicy.policy_id == policy_id,
        )
    ).scalar_one_or_none()
    if msp:
        db.delete(msp)
        db.commit()

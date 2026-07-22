from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from resk_app.models.model import Model
from resk_app.schemas.model import ModelIn, ModelOut, ModelUpdate


def list_models(db: Session, provider_id: uuid.UUID | None = None) -> list[ModelOut]:
    stmt = select(Model).order_by(Model.name)
    if provider_id:
        stmt = stmt.where(Model.provider_id == provider_id)
    models = db.execute(stmt).scalars().all()
    return [_to_out(m) for m in models]


def get_model(db: Session, model_id: uuid.UUID) -> Model | None:
    return db.get(Model, model_id)


def get_model_by_name(db: Session, name: str, provider_id: uuid.UUID | None = None) -> Model | None:
    stmt = select(Model).where(Model.name == name)
    if provider_id is not None:
        stmt = stmt.where(Model.provider_id == provider_id)
    return db.execute(stmt).scalar_one_or_none()


def create_model(db: Session, data: ModelIn) -> ModelOut:
    from fastapi import HTTPException, status

    if get_model_by_name(db, data.name, data.provider_id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Model name already exists for this provider")

    model = Model(
        provider_id=data.provider_id,
        name=data.name,
        type=data.type,
        temperature=data.temperature,
        top_k=data.top_k,
        max_tokens=data.max_tokens,
        stream_supported=data.stream_supported,
        context_window=data.context_window,
        response_length_limit=data.response_length_limit,
        special_tokens=data.special_tokens,
        context_full_strategy=data.context_full_strategy,
        injection_rules=data.injection_rules,
        is_active=data.is_active,
    )
    db.add(model)
    db.commit()
    db.refresh(model)
    return _to_out(model)


def update_model(db: Session, model: Model, data: ModelUpdate) -> ModelOut:
    if data.provider_id is not None:
        model.provider_id = data.provider_id
    if data.name is not None:
        model.name = data.name
    if data.type is not None:
        model.type = data.type
    if data.temperature is not None:
        model.temperature = data.temperature
    if data.top_k is not None:
        model.top_k = data.top_k
    if data.max_tokens is not None:
        model.max_tokens = data.max_tokens
    if data.stream_supported is not None:
        model.stream_supported = data.stream_supported
    if data.context_window is not None:
        model.context_window = data.context_window
    if data.response_length_limit is not None:
        model.response_length_limit = data.response_length_limit
    if data.special_tokens is not None:
        model.special_tokens = data.special_tokens
    if data.context_full_strategy is not None:
        model.context_full_strategy = data.context_full_strategy
    if data.injection_rules is not None:
        model.injection_rules = data.injection_rules
    if data.is_active is not None:
        model.is_active = data.is_active

    db.commit()
    db.refresh(model)
    return _to_out(model)


def delete_model(db: Session, model: Model) -> None:
    db.delete(model)
    db.commit()


def _to_out(m: Model) -> ModelOut:
    return ModelOut(
        id=m.id,
        provider_id=m.provider_id,
        name=m.name,
        type=m.type,
        temperature=m.temperature,
        top_k=m.top_k,
        max_tokens=m.max_tokens,
        stream_supported=m.stream_supported,
        context_window=m.context_window,
        response_length_limit=m.response_length_limit,
        special_tokens=m.special_tokens,
        context_full_strategy=m.context_full_strategy,
        injection_rules=m.injection_rules,
        is_active=m.is_active,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )

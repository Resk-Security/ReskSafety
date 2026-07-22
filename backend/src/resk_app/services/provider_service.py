from __future__ import annotations

import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from resk_app.config import get_settings
from resk_app.crypto import decrypt_api_key, encrypt_api_key
from resk_app.models.model import Model
from resk_app.models.provider import Provider
from resk_app.schemas.model import ModelIn
from resk_app.schemas.provider import ProviderIn, ProviderOut, ProviderTestResult, ProviderUpdate


def _mask_key(api_key: str | None) -> str | None:
    if not api_key or len(api_key) < 8:
        return None
    return api_key[:4] + "****" + api_key[-4:]


def list_providers(db: Session) -> list[ProviderOut]:
    providers = db.execute(select(Provider).order_by(Provider.name)).scalars().all()
    return [_to_out(p) for p in providers]


def get_provider(db: Session, provider_id: uuid.UUID) -> Provider | None:
    return db.get(Provider, provider_id)


def create_provider(db: Session, data: ProviderIn) -> ProviderOut:
    from sqlalchemy import select
    if db.scalar(select(Provider).where(Provider.name == data.name)):
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Provider name exists")

    settings = get_settings()
    enc_key = settings.PROVIDER_ENCRYPTION_KEY
    encrypted = encrypt_api_key(data.api_key or "", enc_key) if data.api_key else None

    provider = Provider(
        name=data.name,
        provider_type=data.provider_type,
        endpoint=data.endpoint.rstrip("/"),
        api_key_enc=encrypted,
        models=data.models,
        default_model=data.default_model,
        stream_supported=data.stream_supported,
        is_active=data.is_active,
        security_config=data.security_config.model_dump() if data.security_config else None,
        special_tokens=data.special_tokens,
        response_length_limit=data.response_length_limit,
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    sync_provider_models(db, provider)
    db.refresh(provider)
    return _to_out(provider)


def update_provider(db: Session, provider: Provider, data: ProviderUpdate) -> ProviderOut:
    settings = get_settings()
    enc_key = settings.PROVIDER_ENCRYPTION_KEY

    if data.name is not None:
        provider.name = data.name
    if data.provider_type is not None:
        provider.provider_type = data.provider_type
    if data.endpoint is not None:
        provider.endpoint = data.endpoint.rstrip("/")
    if data.api_key is not None:
        provider.api_key_enc = encrypt_api_key(data.api_key, enc_key) if data.api_key else None
    if data.models is not None:
        provider.models = data.models
    if data.default_model is not None:
        provider.default_model = data.default_model
    if data.stream_supported is not None:
        provider.stream_supported = data.stream_supported
    if data.is_active is not None:
        provider.is_active = data.is_active
    if data.security_config is not None:
        provider.security_config = data.security_config.model_dump()
    if data.special_tokens is not None:
        provider.special_tokens = data.special_tokens
    if data.response_length_limit is not None:
        provider.response_length_limit = data.response_length_limit

    db.commit()
    db.refresh(provider)
    sync_provider_models(db, provider)
    db.refresh(provider)
    return _to_out(provider)


def delete_provider(db: Session, provider: Provider) -> None:
    db.delete(provider)
    db.commit()


def test_provider(db: Session, provider: Provider) -> ProviderTestResult:
    settings = get_settings()
    enc_key = settings.PROVIDER_ENCRYPTION_KEY
    api_key = decrypt_api_key(provider.api_key_enc, enc_key)

    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    url = f"{provider.endpoint}/models"

    try:
        resp = httpx.get(url, headers=headers, timeout=10)
        if resp.is_success:
            data = resp.json()
            models = [m.get("id", "") for m in (data.get("data", data.get("models", [])))]
            return ProviderTestResult(success=True, message=f"Connected ({resp.status_code})", models_found=models)
        return ProviderTestResult(success=False, message=f"HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        return ProviderTestResult(success=False, message=str(e))


def sync_provider_models(db: Session, provider: Provider) -> None:
    """Create Model entities from Provider.models JSON list if they don't exist."""
    model_names = provider.models or []
    if not model_names:
        return
    from sqlalchemy import select
    existing = {m.name for m in db.execute(
        select(Model).where(Model.provider_id == provider.id)
    ).scalars().all()}
    for name in model_names:
        if name not in existing:
            m = Model(
                provider_id=provider.id,
                name=name,
                type="remote" if provider.endpoint else "local",
            )
            db.add(m)
    if existing and provider.default_model:
        default = db.execute(
            select(Model).where(Model.provider_id == provider.id, Model.name == provider.default_model)
        ).scalar_one_or_none()
        if default:
            provider.default_model_id = default.id
    db.commit()


def _to_out(p: Provider) -> ProviderOut:
    return ProviderOut(
        id=p.id,
        name=p.name,
        provider_type=p.provider_type,
        endpoint=p.endpoint,
        api_key_masked=_mask_key(p.api_key_enc) if p.api_key_enc else None,
        models=p.models,
        default_model=p.default_model,
        stream_supported=p.stream_supported,
        is_active=p.is_active,
        security_config=p.security_config,
        special_tokens=p.special_tokens,
        response_length_limit=p.response_length_limit,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )
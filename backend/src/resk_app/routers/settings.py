"""Settings router: global engine configuration."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from resk_app.auth.dependencies import CurrentAdmin, get_current_admin
from resk_app.llm.tokenizer_cache import get_special_token_info
from resk_app.schemas.settings import GlobalSettings, ModelTokenizerConfig
from resk_app.services.settings_service import get_global_settings, save_global_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/global", response_model=GlobalSettings)
def get_settings(
    _: CurrentAdmin = Depends(get_current_admin),
):
    return get_global_settings()


@router.put("/global", response_model=GlobalSettings)
def put_settings(
    settings: GlobalSettings,
    _: CurrentAdmin = Depends(get_current_admin),
):
    return save_global_settings(settings)


from pydantic import BaseModel


class DetectRequest(BaseModel):
    tokenizer_name: str | None = None
    trust_remote_code: bool = False
    add_prefix_space: bool = False
    custom_special_tokens: list[str] = []


@router.post("/tokenizer/{model_name}/detect")
def detect_tokenizer(
    model_name: str,
    body: DetectRequest | None = None,
    _: CurrentAdmin = Depends(get_current_admin),
):
    """Load the tokenizer for *model_name* and return its special tokens."""
    config = ModelTokenizerConfig(
        model_name=model_name,
        tokenizer_name=body.tokenizer_name if body else None,
        trust_remote_code=body.trust_remote_code if body else False,
        add_prefix_space=body.add_prefix_space if body else False,
        custom_special_tokens=body.custom_special_tokens if body else [],
    )
    return get_special_token_info(model_name, config)

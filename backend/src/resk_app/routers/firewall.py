"""Public LLM firewall router.

- POST /v1/chat/completions        (OpenAI-compatible, with security layers)
- POST /v1/chat/completions/batch  (batch tool calls submission)
- POST /v1/tokenize                (debug)
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from typing import Annotated

from fastapi import Header

from resk_app.auth.dependencies import CurrentUser, _load_user_from_token, get_current_user
from resk_app.auth.jwt import decode_jwt
from fastapi.responses import JSONResponse, StreamingResponse

from resk_app.config import get_settings
from resk_app.db.session import get_db
from resk_app.llm.anthropic_client import (
    call_anthropic_messages,
    call_anthropic_messages_stream,
    extract_anthropic_response_text,
    extract_anthropic_text_delta,
)
from resk_app.llm.client import call_openai_chat
from resk_app.llm.filter_bridge import (
    CompiledPolicy,
    build_processor_from_policy_with_penalty,
    post_filter_text,
)
from resk_app.llm.stream_client import (
    extract_content_delta,
    stream_with_eos_bias,
)
from resk_app.llm.tokenizer_cache import get_tokenizer
from resk_app.models.model import Model as ModelEntity
from resk_app.models.provider import Provider
from resk_app.rbac import has_capability
from resk_app.schemas.anthropic import AnthropicRequest, AnthropicResponse
from resk_app.schemas.firewall import (
    BatchToolCallRequest,
    ChatCompletionRequest,
    ChatCompletionResponse,
    OpenAIModelEntry,
    OpenAIModelListResponse,
    TokenizeRequest,
    TokenizeResponse,
)
from resk_app.services.log_service import log_request
from resk_app.services.model_service import get_model_by_name, list_models
from resk_app.services.policy_service import get_compiled_policy_for_user, get_user_policies
from resk_app.services.settings_service import get_global_settings

from resk_app.limiter import limiter, rate_limit

router = APIRouter(prefix="/v1", tags=["firewall"])

CAN_CALL_TOOLS_BIT = 0


def _first_policy_id(user, db: Session) -> uuid.UUID | None:
    policies = get_user_policies(user, db)
    return policies[0].id if policies else None


def _aggregate_scanning(policies) -> dict[str, Any] | None:
    """Aggregate scanning config from user policies (merged into semantic_detection)."""
    enabled: list[dict] = []
    for p in policies:
        sd = p.semantic_detection or {}
        if sd.get("enabled", False):
            enabled.append(sd)
    if not enabled:
        return None
    return {
        "min_confidence_threshold": min(e.get("min_confidence_threshold", 0.3) for e in enabled),
        "block_score_threshold": min(e.get("block_score_threshold", 5.0) for e in enabled),
        "block_categories": list(set(
            c for e in enabled for c in e.get("block_categories", [])
        )),
        "block_on_first_threat": any(e.get("block_on_first_threat", True) for e in enabled),
    }


def _aggregate_logits(policies) -> dict[str, Any] | None:
    """Aggregate logits config from user policies (merged into classifiers)."""
    enabled: list[dict] = []
    for p in policies:
        cf = p.classifiers or {}
        if cf.get("enabled", False):
            enabled.append(cf)
    if not enabled:
        return None
    penalty = min(e.get("shadow_penalty", -15.0) for e in enabled)
    multi_levels = [e.get("multi_level", {}) for e in enabled if e.get("multi_level", {}).get("enabled")]
    multi = None
    if multi_levels:
        multi = {
            "enabled": True,
            "penalties": {
                "high": min(m.get("penalties", {}).get("high", -20.0) for m in multi_levels),
                "medium": min(m.get("penalties", {}).get("medium", -10.0) for m in multi_levels),
                "low": min(m.get("penalties", {}).get("low", -5.0) for m in multi_levels),
            },
        }
    return {"shadow_penalty": penalty, "multi_level": multi}


def _aggregate_jailbreak_patterns(policies) -> list[str]:
    """Extract jailbreak substring patterns from all user policies' classifiers config."""
    seen: set[str] = set()
    for p in policies:
        cf = p.classifiers or {}
        for pattern in cf.get("jailbreak_patterns", []):
            if isinstance(pattern, str) and pattern not in seen:
                seen.add(pattern)
    return list(seen)


def _resolve_anthropic_user(
    x_api_key: str | None,
    db: Session,
) -> CurrentUser | None:
    """Resolve user from x-api-key header for /v1/messages auth."""
    if not x_api_key:
        return None
    from resk_app.models.user import User
    from sqlalchemy import select

    api_key_setting = get_settings().ANTHROPIC_API_KEY
    if api_key_setting and x_api_key == api_key_setting:
        with_admin = db.execute(select(User).where(User.is_admin == True)).scalars().first()
        return with_admin
    return None


def _get_provider(provider_id_str: str | None, db: Session) -> Any | None:
    if not provider_id_str:
        return None
    try:
        from resk_app.models.provider import Provider
        return db.get(Provider, uuid.UUID(provider_id_str))
    except Exception:
        return None


def _get_model_entity(model_name: str, provider: Any | None, db: Session) -> Any | None:
    """Look up a Model entity by name, optionally scoped to a provider."""
    if not model_name:
        return None
    try:
        if provider:
            return get_model_by_name(db, model_name, provider.id)
        return get_model_by_name(db, model_name)
    except Exception:
        return None


def _apply_model_settings(body: ChatCompletionRequest, model_entity: Any | None) -> tuple[int, float, int | None]:
    """Apply Model-level defaults over request body values."""
    max_tokens = body.max_tokens or 1024
    temperature = body.temperature or 0.7
    response_limit = None
    if model_entity:
        if model_entity.max_tokens is not None and body.max_tokens is None:
            max_tokens = model_entity.max_tokens
        if model_entity.temperature is not None and body.temperature is None:
            temperature = model_entity.temperature
        response_limit = model_entity.response_length_limit
    return max_tokens, temperature, response_limit


async def _stream_chat_completions(
    body: ChatCompletionRequest,
    user: CurrentUser,
    db: Session,
    provider: Any | None,
    model: str,
    model_entity: Any | None,
    scan_cfg: dict[str, Any] | None,
    compiled: CompiledPolicy | None,
) -> AsyncGenerator[bytes, None]:
    """Generate SSE events for streaming chat completions with inline security scanning."""
    settings = get_settings()
    backend = settings.LLM_BACKEND_TYPE.lower()
    policy_id = _first_policy_id(user, db)
    prompt_text = " ".join((m.content or "") for m in body.messages if m.content)
    chat_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    created = int(time.time())

    max_tokens, temperature, _ = _apply_model_settings(body, model_entity)

    accumulated_content = ""
    usage: dict | None = None

    stream_it = stream_with_eos_bias(
        messages=[m.model_dump(exclude_none=True) for m in body.messages],
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        tools=body.tools,
        extra=body.extra,
        provider=provider,
    )

    async for chunk in stream_it:
        if chunk.get("_done"):
            if usage:
                yield _sse_event({"id": chat_id, "object": "chat.completion.chunk", "created": created, "model": model, "choices": [], "usage": usage})
            yield b"data: [DONE]\n\n"
            log_request(db, user_id=user.id, policy_id=policy_id, status="success", backend_type=backend, model=model, prompt=prompt_text)
            return

        choices = chunk.get("choices", [])
        blocked = False
        chunk_has_content = False
        for choice in choices:
            content = extract_content_delta(choice)
            if content:
                chunk_has_content = True
                accumulated_content += content
                if scan_cfg and _run_input_scan(accumulated_content, scan_cfg):
                    blocked = True
                    break

                if compiled:
                    from resk_app.llm.filter_bridge import post_filter_text
                    if post_filter_text(accumulated_content, compiled):
                        yield _sse_event({"id": chat_id, "object": "chat.completion.chunk", "created": created, "model": model, "choices": [{"index": 0, "delta": {"content": ""}, "finish_reason": "stop"}]})
                        yield b"data: [DONE]\n\n"
                        log_request(db, user_id=user.id, policy_id=policy_id, status="blocked", backend_type=backend, model=model, blocked_phrase="output_threat_detected", prompt=prompt_text)
                        return



        usage = chunk.get("usage") or usage

        if blocked:
            yield _sse_event({"id": chat_id, "object": "chat.completion.chunk", "created": created, "model": model, "choices": [{"index": 0, "delta": {"content": ""}, "finish_reason": "stop"}]})
            yield b"data: [DONE]\n\n"
            log_request(db, user_id=user.id, policy_id=policy_id, status="blocked", backend_type=backend, model=model, blocked_phrase="input_threat_detected", prompt=prompt_text)
            return

        yield _sse_event(chunk)

    log_request(db, user_id=user.id, policy_id=policy_id, status="success", backend_type=backend, model=model, prompt=prompt_text)


def _sse_event(data: dict) -> bytes:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")


def _check_jailbreak(text: str, patterns: list[str]) -> str | None:
    """Jailbreak substring detection against the given patterns. Returns matched pattern or None."""
    if not patterns:
        return None
    lower = text.lower()
    for pattern in patterns:
        if pattern in lower:
            return pattern
    return None


def _run_input_scan(text: str, scan_cfg: dict[str, Any] | None) -> bool:
    """Run input through Resk-LLM scanning pipeline. Returns True if blocked."""
    if not scan_cfg:
        return False
    gs = get_global_settings()
    try:
        from resk2.core.config import SecurityConfig as Resk2Config

        resk2_cfg = Resk2Config(
            fail_open=gs.scanning.fail_open,
            block_on_first_threat=scan_cfg.get("block_on_first_threat", True),
            min_confidence_threshold=scan_cfg.get("min_confidence_threshold", 0.3),
            block_score_threshold=scan_cfg.get("block_score_threshold", 5.0),
            languages=gs.scanning.languages,
            max_input_length=gs.scanning.max_input_length,
            enable_caching=gs.scanning.enable_caching,
        )
        pipeline = SecurityPipeline(resk2_cfg)
        pipeline.add(DirectInjectionDetector())
        pipeline.add(BypassDetector())
        pipeline.add(ExfiltrationDetector())
        pipeline.add(GoalHijackDetector())
        pipeline.add(InterAgentInjectionDetector())
        pipeline.add(ContentFramingDetector())
        pipeline.add(MemoryPoisoningDetector())
        result = pipeline.run(text)
        return result.blocked
    except ImportError:
        return False
    except Exception:
        return False


@router.post("/chat/completions")
@rate_limit()
async def chat_completions(
    request: Request,
    body: ChatCompletionRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatCompletionResponse:
    settings = get_settings()
    model = body.model or settings.LLM_DEFAULT_MODEL
    stream = body.stream or False

    policies = get_user_policies(user, db)
    compiled = get_compiled_policy_for_user(user, db) if policies else None
    policy_id = _first_policy_id(user, db)

    provider = _get_provider(request.headers.get("X-Provider-Id"), db)
    model_entity = _get_model_entity(model, provider, db)

    # ── Streaming path ──
    if stream:
        prompt_text = " ".join((m.content or "") for m in body.messages if m.content)
        scan_cfg = _aggregate_scanning(policies)
        jailbreak_patterns = _aggregate_jailbreak_patterns(policies)
        if body.tools and not has_capability(
            sum(r.capabilities_mask for r in user.roles), CAN_CALL_TOOLS_BIT
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tool calling not permitted for this user")
        if _run_input_scan(prompt_text, scan_cfg):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Input blocked by security scanning")
        jailbreak_match = _check_jailbreak(prompt_text, jailbreak_patterns)
        if jailbreak_match:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail=f"Input blocked by jailbreak detection: {jailbreak_match}")
        if compiled:
            phrase_match = post_filter_text(prompt_text, compiled)
            if phrase_match:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                    detail=f"Input blocked by policy: {phrase_match}")
        return StreamingResponse(
            _stream_chat_completions(body, user, db, provider, model, model_entity, scan_cfg, compiled),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    prompt_text = " ".join(
        (m.content or "") for m in body.messages if m.content
    )

    # Tool capability check (bit 0 = can_call_tools)
    if body.tools and not has_capability(
        sum(r.capabilities_mask for r in user.roles), CAN_CALL_TOOLS_BIT
    ):
        log_request(
            db,
            user_id=user.id,
            policy_id=policy_id,
            status="blocked",
            backend_type=settings.LLM_BACKEND_TYPE,
            model=model,
            blocked_phrase="tool_call_not_allowed",
            prompt=prompt_text,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tool calling not permitted for this user",
        )

    # ── Input scanning (pre-generation) — resk2 pipeline ──
    scan_cfg = _aggregate_scanning(policies)
    if _run_input_scan(prompt_text, scan_cfg):
        log_request(db, user_id=user.id, policy_id=policy_id, status="blocked",
                     backend_type=provider.provider_type if provider else settings.LLM_BACKEND_TYPE,
                     model=model, blocked_phrase="input_threat_detected", prompt=prompt_text)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Input blocked by security scanning")

    # ── Input scanning (pre-generation) — jailbreak pattern check from DB config ──
    jailbreak_match = _check_jailbreak(prompt_text, _aggregate_jailbreak_patterns(policies))
    if jailbreak_match:
        log_request(db, user_id=user.id, policy_id=policy_id, status="blocked",
                     backend_type=provider.provider_type if provider else settings.LLM_BACKEND_TYPE,
                     model=model, blocked_phrase=f"jailbreak:{jailbreak_match}", prompt=prompt_text)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"Input blocked by jailbreak detection: {jailbreak_match}")

    # ── Input scanning (pre-generation) — banned phrase check from policy ──
    if compiled:
        phrase_match = post_filter_text(prompt_text, compiled)
        if phrase_match:
            log_request(db, user_id=user.id, policy_id=policy_id, status="blocked",
                         backend_type=provider.provider_type if provider else settings.LLM_BACKEND_TYPE,
                         model=model, blocked_phrase=phrase_match, prompt=prompt_text)
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail=f"Input blocked by policy: {phrase_match}")

    # ── Memory injection (pre-generation) — inject context from session memory ──
    if body.session_id and policy_id:
        try:
            from resk_app.models.policy import Policy
            from resk_app.services.memory_service import get_injectable_context
            pol = db.get(Policy, policy_id)
            rules = pol.memory_injection_rules if pol else None
            injected = get_injectable_context(db, body.session_id, 0, rules)
            if injected:
                body.messages.insert(0, ChatMessage(role="system", content=injected))
        except Exception:
            pass

    backend = settings.LLM_BACKEND_TYPE.lower()

    # ---------- Distant backend (OpenAI / vLLM / Ollama HTTP) ----------
    if backend in ("openai", "deepseek", "vllm", "ollama"):
        messages = [m.model_dump(exclude_none=True) for m in body.messages]
        max_tokens, temperature, _ = _apply_model_settings(body, model_entity)
        try:
            raw = await call_openai_chat(
                messages=messages,
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                tools=body.tools,
                stream=stream,
                extra=body.extra,
                provider=provider,
            )
        except Exception as exc:
            log_request(
                db,
                user_id=user.id,
                policy_id=policy_id,
                status="error",
                backend_type=backend,
                model=model,
                prompt=prompt_text,
                extra={"error": str(exc)[:500]},
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"LLM backend error: {exc}",
            ) from exc

        # Post-filter response (no logits access on distant API)
        blocked_phrase = None
        if compiled:
            for choice in raw.get("choices", []):
                content = choice.get("message", {}).get("content") or ""
                blocked_phrase = post_filter_text(content, compiled)
                if blocked_phrase:
                    break

        if blocked_phrase:
            log_request(
                db,
                user_id=user.id,
                policy_id=policy_id,
                status="blocked",
                backend_type=backend,
                model=model,
                blocked_phrase=blocked_phrase,
                prompt=prompt_text,
            )
            return ChatCompletionResponse(
                id=raw.get("id", str(uuid.uuid4())),
                created=raw.get("created", int(time.time())),
                model=model,
                choices=raw.get("choices", []),
                usage=raw.get("usage"),
                blocked=True,
                blocked_phrase=blocked_phrase,
            )

        log_request(
            db,
            user_id=user.id,
            policy_id=policy_id,
            status="success",
            backend_type=backend,
            model=model,
            prompt=prompt_text,
        )
        return ChatCompletionResponse(
            id=raw.get("id", str(uuid.uuid4())),
            created=raw.get("created", int(time.time())),
            model=model,
            choices=raw.get("choices", []),
            usage=raw.get("usage"),
        )

    # ---------- Local backend (transformers / vLLM in-process) ----------
    if backend == "local":
        gs = get_global_settings()
        logits_cfg = _aggregate_logits(policies)
        logits_enabled = logits_cfg is not None
        device = gs.logits.device if logits_enabled else "cpu"
        penalty = logits_cfg["shadow_penalty"] if logits_enabled else -15.0

        tok_config = gs.tokenizers.model_tokenizers.get(model)
        tokenizer = get_tokenizer(model, tok_config)
        protected_ids: list[int] | None = None
        if gs.tokenizers.protect_special_tokens and tok_config:
            protected_ids = tok_config.detected_special_token_ids
        processor = None
        if compiled and tokenizer is not None:
            processor = build_processor_from_policy_with_penalty(
                compiled, tokenizer, device, penalty,
                protected_token_ids=protected_ids,
            )

        if processor is None:
            # Fall back to post-filter only
            messages = [m.model_dump(exclude_none=True) for m in body.messages]
            raw = await call_openai_chat(
                messages=messages,
                model=model,
                max_tokens=body.max_tokens or 1024,
                temperature=body.temperature or 0.7,
                tools=body.tools,
                stream=stream,
                extra=body.extra,
                provider=provider,
            )
            blocked_phrase = None
            if compiled:
                for choice in raw.get("choices", []):
                    content = choice.get("message", {}).get("content") or ""
                    blocked_phrase = post_filter_text(content, compiled)
                    if blocked_phrase:
                        break
            status_str = "blocked" if blocked_phrase else "success"
            log_request(
                db,
                user_id=user.id,
                policy_id=policy_id,
                status=status_str,
                backend_type="local",
                model=model,
                blocked_phrase=blocked_phrase,
                prompt=prompt_text,
            )
            return ChatCompletionResponse(
                id=raw.get("id", str(uuid.uuid4())),
                created=raw.get("created", int(time.time())),
                model=model,
                choices=raw.get("choices", []),
                usage=raw.get("usage"),
                blocked=bool(blocked_phrase),
                blocked_phrase=blocked_phrase,
            )

        # Local generation with logits processor
        try:
            from resklogits import CachedGenerator  # type: ignore
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="resklogits not available for local generation",
            ) from exc

        gen = CachedGenerator(tokenizer=tokenizer, model_name=model)
        output = gen.generate(
            prompt_text,
            max_new_tokens=body.max_tokens or 1024,
            logits_processors=[processor],
        )
        blocked_phrase = post_filter_text(output, compiled) if compiled else None
        status_str = "blocked" if blocked_phrase else "success"
        log_request(
            db,
            user_id=user.id,
            policy_id=policy_id,
            status=status_str,
            backend_type="local",
            model=model,
            blocked_phrase=blocked_phrase,
            prompt=prompt_text,
        )
        return ChatCompletionResponse(
            id=str(uuid.uuid4()),
            created=int(time.time()),
            model=model,
            choices=[
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": output},
                    "finish_reason": "stop",
                }
            ],
            blocked=bool(blocked_phrase),
            blocked_phrase=blocked_phrase,
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unknown LLM_BACKEND_TYPE: {backend}",
    )


@router.post("/tokenize")
@rate_limit()
def tokenize(
    request: Request,
    body: TokenizeRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TokenizeResponse:
    settings = get_settings()
    app_settings = get_global_settings()
    model = body.model or settings.LLM_DEFAULT_MODEL
    tok_config = app_settings.tokenizers.model_tokenizers.get(model)
    tokenizer = get_tokenizer(model, tok_config)
    if tokenizer is None:
        return TokenizeResponse(
            tokens=[],
            blocked_tokens=[],
            blocked_phrases=[],
            model=model,
        )
    tokens = tokenizer.encode(body.text, add_special_tokens=False)
    compiled = get_compiled_policy_for_user(user, db)
    blocked_phrases: list[str] = []
    blocked_tokens: list[int] = []
    if compiled:
        lower = body.text.lower()
        protected_set = set()
        if app_settings.tokenizers.protect_special_tokens and tok_config:
            protected_set = set(tok_config.detected_special_token_ids)
        for phrase in compiled.banned_phrases:
            if phrase and phrase.lower() in lower:
                blocked_phrases.append(phrase)
                ids = tokenizer.encode(phrase, add_special_tokens=False)
                for tid in ids:
                    if tid not in protected_set:
                        blocked_tokens.append(tid)
    return TokenizeResponse(
        tokens=tokens if isinstance(tokens, list) else list(tokens),
        blocked_tokens=blocked_tokens,
        blocked_phrases=blocked_phrases,
        model=model,
    )


@router.get("/models", response_model=OpenAIModelListResponse)
async def list_models_public(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OpenAIModelListResponse:
    models = list_models(db)
    data = []
    now = int(time.time())
    for m in models:
        owned_by = "resk"
        if m.provider_id:
            prov = db.get(Provider, m.provider_id)
            if prov:
                owned_by = prov.name
        entry = OpenAIModelEntry(
            id=m.name,
            created=int(m.created_at.timestamp()) if m.created_at else now,
            owned_by=owned_by,
        )
        data.append(entry)
    return OpenAIModelListResponse(data=data)


@router.post("/chat/completions/batch")
@rate_limit()
async def batch_tool_calls(
    request: Request,
    body: BatchToolCallRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatCompletionResponse:
    """Submit batch tool call results and get the LLM's continuation response.

    Accepts a list of tool call results (id + output).
    Appends them as 'tool' role messages and re-invokes the model.
    """
    settings = get_settings()
    model = body.model or settings.LLM_DEFAULT_MODEL
    policies = get_user_policies(user, db)
    compiled = get_compiled_policy_for_user(user, db) if policies else None
    policy_id = _first_policy_id(user, db)
    provider = _get_provider(request.headers.get("X-Provider-Id"), db)

    if not has_capability(sum(r.capabilities_mask for r in user.roles), CAN_CALL_TOOLS_BIT):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tool calling not permitted for this user")

    tool_messages = []
    for tc in body.tool_calls:
        tool_messages.append({
            "role": "tool",
            "tool_call_id": tc.get("id", tc.get("tool_call_id", "")),
            "content": tc.get("output", tc.get("content", "")),
        })

    all_messages = [m.model_dump(exclude_none=True) for m in body.messages] + tool_messages

    prompt_text = " ".join(m.get("content") or "" for m in all_messages if isinstance(m, dict))
    scan_cfg = _aggregate_scanning(policies)
    if _run_input_scan(prompt_text, scan_cfg):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Input blocked by security scanning")

    backend = settings.LLM_BACKEND_TYPE.lower()
    if backend in ("openai", "deepseek", "vllm", "ollama"):
        try:
            raw = await call_openai_chat(
                messages=all_messages,
                model=model,
                max_tokens=1024,
                temperature=0.7,
                provider=provider,
            )
        except Exception as exc:
            log_request(db, user_id=user.id, policy_id=policy_id, status="error", backend_type=backend, model=model, prompt=prompt_text, extra={"error": str(exc)[:500]})
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"LLM backend error: {exc}") from exc

        blocked_phrase = None
        if compiled:
            for choice in raw.get("choices", []):
                content = choice.get("message", {}).get("content") or ""
                blocked_phrase = post_filter_text(content, compiled)
                if blocked_phrase:
                    break

        if blocked_phrase:
            log_request(db, user_id=user.id, policy_id=policy_id, status="blocked", backend_type=backend, model=model, blocked_phrase=blocked_phrase, prompt=prompt_text)
            return ChatCompletionResponse(
                id=raw.get("id", str(uuid.uuid4())), created=raw.get("created", int(time.time())),
                model=model, choices=raw.get("choices", []), usage=raw.get("usage"),
                blocked=True, blocked_phrase=blocked_phrase,
            )

        log_request(db, user_id=user.id, policy_id=policy_id, status="success", backend_type=backend, model=model, prompt=prompt_text)
        return ChatCompletionResponse(
            id=raw.get("id", str(uuid.uuid4())), created=raw.get("created", int(time.time())),
            model=model, choices=raw.get("choices", []), usage=raw.get("usage"),
        )

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown LLM_BACKEND_TYPE: {backend}")


# ── Anthropic /v1/messages ──

async def _stream_anthropic(
    messages: list[dict],
    model: str,
    system_block: str | list[dict] | None,
    body: AnthropicRequest,
    user: CurrentUser,
    db: Session,
    provider: Any | None,
    compiled: CompiledPolicy | None,
) -> AsyncGenerator[bytes, None]:
    """Stream Anthropic SSE events with inline security scanning."""
    settings = get_settings()
    policy_id = _first_policy_id(user, db)
    prompt_text = " ".join((m.get("content") or "") if isinstance(m, dict) else "" for m in messages)
    chat_id = f"msg_{uuid.uuid4().hex[:12]}"
    accumulated_text = ""
    has_blocked = False

    stream_it = call_anthropic_messages_stream(
        messages=messages,
        model=model,
        max_tokens=body.max_tokens or 1024,
        temperature=body.temperature,
        system=system_block,
        top_k=body.top_k,
        top_p=body.top_p,
        stop_sequences=body.stop_sequences,
        metadata=body.metadata,
        provider=provider,
    )

    async for event in stream_it:
        if has_blocked:
            break

        text = extract_anthropic_text_delta(event)
        if text:
            accumulated_text += text
            if compiled:
                if post_filter_text(accumulated_text, compiled):
                    has_blocked = True
                    break

        lines = [_anthropic_sse_line(event["event"], event["data"])]
        if event.get("data", {}).get("type") == "message_stop":
            log_request(db, user_id=user.id, policy_id=policy_id, status="success" if not has_blocked else "blocked", backend_type="anthropic", model=model, prompt=prompt_text)
        yield b"".join(lines)

    if has_blocked:
        yield _anthropic_sse_line("message_stop", {"type": "message_stop"})
        log_request(db, user_id=user.id, policy_id=policy_id, status="blocked", backend_type="anthropic", model=model, blocked_phrase="output_threat_detected", prompt=prompt_text)


def _anthropic_sse_line(event_type: str, data: dict) -> bytes:
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")


async def _anthropic_error_stream(message: str) -> AsyncGenerator[bytes, None]:
    yield _anthropic_sse_line("error", {"type": "error", "error": {"type": "forbidden", "message": message}})


def _anthropic_or_jwt_user(
    request: Request,
    db: Session = Depends(get_db),
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    x_api_key: Annotated[str | None, Header(alias="x-api-key")] = None,
) -> CurrentUser:
    """Auth: JWT Bearer, user_token cookie, or x-api-key (for Anthropic SDK compat)."""
    token: str | None = None

    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif request.cookies.get("user_token"):
        token = request.cookies["user_token"]
    elif request.cookies.get("admin_token"):
        token = request.cookies["admin_token"]
    elif x_api_key:
        api_user = _resolve_anthropic_user(x_api_key, db)
        if api_user:
            return api_user

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        return _load_user_from_token(token, db, "user")[0]
    except HTTPException:
        pass
    return _load_user_from_token(token, db, "admin")[0]


@router.post("/messages")
@rate_limit()
async def anthropic_messages(
    request: Request,
    body: AnthropicRequest,
    user: CurrentUser = Depends(_anthropic_or_jwt_user),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    model = body.model or settings.LLM_DEFAULT_MODEL
    stream = body.stream or False

    policies = get_user_policies(user, db)
    compiled = get_compiled_policy_for_user(user, db) if policies else None
    policy_id = _first_policy_id(user, db)
    provider = _get_provider(request.headers.get("X-Provider-Id"), db)

    messages = [m.model_dump(exclude_none=True) for m in body.messages]
    system_block = body.system

    prompt_text = " ".join((m.get("content") or "") if isinstance(m, dict) else "" for m in messages)
    scan_cfg = _aggregate_scanning(policies)

    if _run_input_scan(prompt_text, scan_cfg):
        if stream:
            return StreamingResponse(
                _anthropic_error_stream("Input blocked by security scanning"),
                media_type="text/event-stream",
            )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Input blocked by security scanning")

    if stream:
        return StreamingResponse(
            _stream_anthropic(messages, model, system_block, body, user, db, provider, compiled),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    try:
        raw = await call_anthropic_messages(
            messages=messages,
            model=model,
            max_tokens=body.max_tokens or 1024,
            temperature=body.temperature,
            system=system_block,
            top_k=body.top_k,
            top_p=body.top_p,
            stop_sequences=body.stop_sequences,
            metadata=body.metadata,
            provider=provider,
        )
    except Exception as exc:
        log_request(db, user_id=user.id, policy_id=policy_id, status="error", backend_type="anthropic", model=model, prompt=prompt_text, extra={"error": str(exc)[:500]})
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Anthropic backend error: {exc}") from exc

    content_text = extract_anthropic_response_text(raw)
    blocked_phrase = None
    if compiled:
        blocked_phrase = post_filter_text(content_text, compiled)

    usage = {
        "input_tokens": raw.get("usage", {}).get("input_tokens", 0),
        "output_tokens": raw.get("usage", {}).get("output_tokens", 0),
    }
    if blocked_phrase:
        log_request(db, user_id=user.id, policy_id=policy_id, status="blocked", backend_type="anthropic", model=model, blocked_phrase=blocked_phrase, prompt=prompt_text)
        return AnthropicResponse(
            id=raw.get("id", f"msg_{uuid.uuid4().hex[:12]}"),
            model=model,
            content=raw.get("content", []),
            stop_reason=raw.get("stop_reason"),
            stop_sequence=raw.get("stop_sequence"),
            usage=usage,
            blocked=True,
            blocked_phrase=blocked_phrase,
        )

    log_request(db, user_id=user.id, policy_id=policy_id, status="success", backend_type="anthropic", model=model, prompt=prompt_text)
    return AnthropicResponse(
        id=raw.get("id", f"msg_{uuid.uuid4().hex[:12]}"),
        model=model,
        content=[
            {"type": b.get("type", "text"), "text": b.get("text", "")}
            for b in (raw.get("content") or [])
        ],
        stop_reason=raw.get("stop_reason"),
        stop_sequence=raw.get("stop_sequence"),
        usage=usage,
    )

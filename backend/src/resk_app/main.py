"""FastAPI application factory and entrypoint."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

import logging

from resk_app.config import get_settings
from resk_app.db.base import init_db
from resk_app.limiter import limiter

logger = logging.getLogger(__name__)
from resk_app.routers import (
    auth_router,
    capabilities_router,
    hooks_router,
    mcp_router,
    mcp_server_router,
    memory_router,
    models_router,
    newsletter_router,
    policy_configs_router,
    policies_router,
    policy_rules_router,
    providers_router,
    roles_router,
    sessions_router,
    settings_router,
    users_router,
)
from resk_app.routers.admin import router as admin_router
from resk_app.routers.firewall import router as firewall_router
from resk_app.routers.tracker import router as tracker_router
from resk_app.seed import run_seed, run_seed_prod, run_seed_logs


def _seed_on_startup() -> None:
    """Create tables (SQLite dev) and seed defaults."""
    init_db()
    run_seed()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _seed_on_startup()
    run_seed_prod()
    run_seed_logs()
    settings = get_settings()
    if not settings.PROVIDER_ENCRYPTION_KEY:
        logger.warning(
            "PROVIDER_ENCRYPTION_KEY is not set — provider API keys stored in the "
            "database will be encrypted with an empty key and can be trivially decrypted. "
            "Set a strong random key via .env or environment variable."
        )
    yield


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="RESK - LLM Firewall",
        description="RBAC + policies + LLM firewall (OpenAI-compatible)",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-CSRF-Token"],
    )

    # Optional RESK-LLM (resk2) middleware - disabled by default
    if settings.RESK2_ENABLED:
        try:
            from resk2.integrations.fastapi import ReskMiddleware  # type: ignore

            app.add_middleware(ReskMiddleware)
        except Exception:
            pass

    @app.get("/health", tags=["meta"])
    def health() -> dict:
        return {"status": "ok", "version": "0.1.0"}

    @app.get("/favicon.ico", tags=["meta"], include_in_schema=False)
    def favicon():
        svg = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#6366f1"/><text x="8" y="12" text-anchor="middle" fill="white" font-size="10" font-weight="bold">R</text></svg>'
        return Response(content=svg, media_type="image/svg+xml")

    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(roles_router)
    app.include_router(policy_configs_router)
    app.include_router(policies_router)
    app.include_router(policy_rules_router)
    app.include_router(capabilities_router)
    app.include_router(admin_router)
    app.include_router(firewall_router)
    app.include_router(sessions_router)
    app.include_router(memory_router)
    app.include_router(mcp_router)
    app.include_router(mcp_server_router)
    app.include_router(newsletter_router)
    app.include_router(models_router)
    app.include_router(providers_router)
    app.include_router(settings_router)
    app.include_router(tracker_router)
    return app


app = create_app()

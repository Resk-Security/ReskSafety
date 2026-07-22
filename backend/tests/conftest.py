"""Shared test fixtures: in-memory SQLite DB, seeded admin, authenticated client."""

from __future__ import annotations

import os
import tempfile
import uuid
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

_DB_FILE = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_DB_PATH = _DB_FILE.name
_DB_FILE.close()

# Must set before any resk_app import
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_PATH}"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["CSRF_SECRET"] = "test-csrf-secret"
os.environ["CORS_ORIGINS"] = "*"
os.environ["LOG_LEVEL"] = "CRITICAL"
os.environ["SECURITY_CONFIG_PATH"] = "/tmp/resk_test_security.yaml"
os.environ["RATE_LIMIT_PER_MINUTE"] = "999999"
os.environ["PROVIDER_ENCRYPTION_KEY"] = "3NdZtmIvoFlMo81FcfEYdloN0L012YChN_ic8nQnJ9w="

from resk_app.config import get_settings  # noqa: E402
from resk_app.db.base import Base, get_session_factory  # noqa: E402
from resk_app.auth.passwords import hash_password  # noqa: E402
from resk_app.auth.jwt import create_jwt  # noqa: E402
from resk_app.rbac import build_mask  # noqa: E402

# Settings singleton must be refreshed
get_settings.cache_clear()
# Also clear the DB engine singleton so tests get fresh engines
from resk_app.db.base import _engine, _SessionLocal as _session_local
import resk_app.db.base as db_base
db_base._engine = None
db_base._SessionLocal = None


_GLOBAL_ENGINE = None

def _get_or_create_engine():
    global _GLOBAL_ENGINE
    if _GLOBAL_ENGINE is None:
        import resk_app.models  # noqa: F401
        _GLOBAL_ENGINE = create_engine(f"sqlite:///{_DB_PATH}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=_GLOBAL_ENGINE)
    return _GLOBAL_ENGINE


@pytest.fixture(autouse=True)
def db_session():
    engine = _get_or_create_engine()
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    from resk_app.db.base import _engine, _SessionLocal
    # Ensure the app uses the same engine for its session factory
    import resk_app.db.base as db_base
    db_base._engine = engine
    db_base._SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def override_get_db(db_session: Session):
    """Return a dependency override to inject the test DB session."""

    def _get_db():
        yield db_session

    return _get_db


@pytest.fixture
def admin_user(db_session: Session) -> dict[str, Any]:
    """Create and return a seeded admin user."""
    from resk_app.models.user import User
    uid = uuid.uuid4()
    user = User(
        id=uid,
        username="testadmin",
        email="testadmin@example.com",
        hashed_password=hash_password("testpass"),
        is_active=True,
        is_admin=True,
    )
    db_session.add(user)
    db_session.commit()
    return {"id": str(uid), "username": "testadmin", "is_admin": True, "user": user}


@pytest.fixture
def seeded_capabilities(db_session: Session) -> dict[int, str]:
    """Seed default capabilities and return {bit_position: name}."""
    from resk_app.rbac.capabilities import DEFAULT_CAPABILITIES
    from resk_app.models.capability import Capability
    mapping: dict[int, str] = {}
    for cap in DEFAULT_CAPABILITIES:
        c = Capability(
            bit_position=cap["bit_position"],
            name=cap["name"],
            description=cap["description"],
        )
        db_session.merge(c)
        mapping[cap["bit_position"]] = cap["name"]
    db_session.commit()
    return mapping


@pytest.fixture
def admin_auth_headers(admin_user: dict[str, Any]) -> dict[str, str]:
    """Return auth cookies + CSRF header for the admin user."""
    from resk_app.models.user import User
    mask = build_mask(0, 1, 2, 3, 4, 5, 6, 7)
    token, csrf = create_jwt(
        user_id=uuid.UUID(admin_user["id"]),
        username=admin_user["username"],
        is_admin=True,
        capabilities_mask=mask,
        token_type="admin",
    )
    return {
        "Cookie": f"admin_token={token}; csrf_token={csrf}",
        "X-CSRF-Token": csrf,
        "Content-Type": "application/json",
    }


@pytest.fixture
def seeded_role(db_session: Session, seeded_capabilities) -> dict[str, Any]:
    """Create a role with all capabilities."""
    from resk_app.models.role import Role
    rid = uuid.uuid4()
    role = Role(
        id=rid,
        name="test-role",
        description="Test role with all caps",
        capabilities_mask=build_mask(0, 1, 2, 3, 4, 5, 6, 7),
    )
    db_session.add(role)
    db_session.commit()
    return {"id": str(rid), "name": "test-role"}


@pytest.fixture
def seeded_non_admin_user(db_session: Session, seeded_role) -> dict[str, Any]:
    """Create a non-admin user with the seeded role."""
    from resk_app.models.user import User
    from resk_app.models.role import Role
    uid = uuid.uuid4()
    role = db_session.get(Role, uuid.UUID(seeded_role["id"]))
    user = User(
        id=uid,
        username="testuser",
        email="testuser@example.com",
        hashed_password=hash_password("userpass"),
        is_active=True,
        is_admin=False,
        roles=[role] if role else [],
    )
    db_session.add(user)
    db_session.commit()
    return {"id": str(uid), "username": "testuser", "is_admin": False, "user": user}


@pytest.fixture
def user_auth_headers(seeded_non_admin_user: dict[str, Any]) -> dict[str, str]:
    """Return auth headers for the non-admin test user."""
    mask = build_mask(0, 1, 2, 3, 4, 5, 6, 7)
    token, csrf = create_jwt(
        user_id=uuid.UUID(seeded_non_admin_user["id"]),
        username=seeded_non_admin_user["username"],
        is_admin=False,
        capabilities_mask=mask,
        token_type="user",
    )
    return {
        "Cookie": f"user_token={token}",
        "Content-Type": "application/json",
    }


@pytest.fixture(autouse=True)
def _clear_db_engine():
    """Reset the module-level engine before each test to use the test DB."""
    import resk_app.db.base as db_base
    db_base._engine = _get_or_create_engine()
    db_base._SessionLocal = None


@pytest.fixture
def app(override_get_db) -> FastAPI:
    """Build the FastAPI app without the lifespan (avoids DB seeding leaks)."""
    from contextlib import asynccontextmanager
    from fastapi.middleware.cors import CORSMiddleware
    from resk_app.routers import (
        auth_router, capabilities_router, hooks_router,
        mcp_router, mcp_server_router, memory_router, models_router,
        policy_configs_router,
        policies_router, policy_rules_router, providers_router,
        roles_router, sessions_router, settings_router, users_router,
    )
    from resk_app.routers.admin import router as admin_router
    from resk_app.routers.firewall import router as firewall_router
    from resk_app.limiter import limiter
    from slowapi.errors import RateLimitExceeded
    from slowapi import _rate_limit_exceeded_handler

    @asynccontextmanager
    async def noop(_app):
        yield

    app = FastAPI(lifespan=noop)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                        allow_methods=["*"], allow_headers=["*"], expose_headers=["X-CSRF-Token"])

    @app.get("/health", tags=["meta"])
    def health():
        return {"status": "ok", "version": "0.1.0"}

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon():
        from fastapi.responses import Response
        return Response(content=b'', media_type="image/svg+xml")

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
    app.include_router(hooks_router)
    app.include_router(mcp_router)
    app.include_router(mcp_server_router)
    app.include_router(memory_router)
    app.include_router(models_router)
    app.include_router(providers_router)
    app.include_router(settings_router)

    from resk_app.db.session import get_db
    app.dependency_overrides[get_db] = override_get_db
    return app


@pytest.fixture
def client(app: FastAPI) -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def seeded_policy(db_session: Session) -> dict[str, Any]:
    """Create a policy with a simple hard-block rule."""
    from resk_app.models.policy import Policy
    from resk_app.models.policy_rule import PolicyRule
    pid = uuid.uuid4()
    rule = PolicyRule(
        name="block-test",
        description="Blocks the word test",
        rule_type="contains",
        phrases=["test"],
        mode="hard",
    )
    db_session.add(rule)
    db_session.flush()
    policy = Policy(
        id=pid,
        name="test-policy",
        description="Policy for testing",
    )
    policy.rules = [rule]
    db_session.add(policy)
    db_session.commit()
    return {"id": str(pid), "name": "test-policy", "rule_ids": [str(rule.id)]}


@pytest.fixture
def secure_scanning_policy(db_session: Session) -> dict[str, Any]:
    """Create a scanning pipeline config + policy for security tests."""
    from resk_app.models.policy_config import PolicyConfig
    from resk_app.models.policy import Policy
    from resk_app.models.policy_rule import PolicyRule
    import uuid

    cfg = PolicyConfig(
        name="test-scan-pipeline",
        description="Scanning pipeline for security tests",
        config_type="scanning_pipeline",
        config={
            "block_categories": ["direct_injection", "jailbreak"],
            "attack_patterns": ["ignore previous instructions", "you are now"],
            "block_on_first_threat": True,
            "min_confidence_threshold": 0.3,
            "block_score_threshold": 5.0,
        },
    )
    db_session.add(cfg)
    db_session.flush()

    rule = PolicyRule(
        name="block-injection",
        description="Blocks injection attempts",
        rule_type="contains",
        phrases=["ignore previous instructions"],
        mode="hard",
    )
    db_session.add(rule)
    db_session.flush()

    policy = Policy(
        name="secure-policy",
        description="Policy with scanning pipeline",
        scanning_pipeline_config_id=cfg.id,
    )
    policy.rules = [rule]
    db_session.add(policy)
    db_session.commit()
    return {
        "id": str(policy.id),
        "name": "secure-policy",
        "config_id": str(cfg.id),
    }

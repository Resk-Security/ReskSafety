"""SQLAlchemy declarative base and engine factory."""

from __future__ import annotations

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from resk_app.config import get_settings


class Base(DeclarativeBase):
    """Declarative base for all models."""


_engine: Engine | None = None
_SessionLocal: sessionmaker | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        settings = get_settings()
        connect_args = {"check_same_thread": False} if settings.is_sqlite else {}
        _engine = create_engine(
            settings.DATABASE_URL,
            connect_args=connect_args,
            pool_pre_ping=True,
        )
    return _engine


def get_session_factory() -> sessionmaker:
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            bind=get_engine(),
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )
    return _SessionLocal


def _migrate_sqlite(engine: Engine) -> None:
    inspector = inspect(engine)
    with engine.connect() as conn:
        for table, col, col_type in [
            ("providers", "security_config", "JSON"),
            ("providers", "special_tokens", "JSON"),
            ("providers", "response_length_limit", "INTEGER"),
            ("providers", "default_model_id", "VARCHAR(32)"),
            ("policies", "semantic_detection", "JSON"),
            ("policies", "access_control", "JSON"),
            ("policies", "classifiers", "JSON"),
            ("policies", "semantic_detection_config_id", "VARCHAR(32)"),
            ("policies", "access_control_config_id", "VARCHAR(32)"),
            ("policies", "classifiers_config_id", "VARCHAR(32)"),
            ("policies", "scanning_pipeline_config_id", "VARCHAR(32)"),
            ("users", "yolo_mode", "INTEGER"),
            ("roles", "mcp_tool_allowlist", "JSON"),
            ("policies", "memory_injection_rules", "JSON"),
            ("policies", "scanning_pipeline", "JSON"),
        ]:
            if col not in {c["name"] for c in inspector.get_columns(table)}:
                conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
                )
        conn.commit()


def init_db() -> None:
    """Create all tables (used for SQLite dev / tests)."""
    import resk_app.models  # noqa: F401 - register models

    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    _migrate_sqlite(engine)
    _migrate_provider_models()


def _migrate_provider_models() -> None:
    """Sync Model rows from legacy Provider.models JSON on startup."""
    from sqlalchemy import create_engine, select

    from resk_app.config import get_settings
    from resk_app.models.model import Model
    from resk_app.models.provider import Provider
    from resk_app.services.provider_service import sync_provider_models

    settings = get_settings()
    connect_args = {"check_same_thread": False} if settings.is_sqlite else {}
    eng = create_engine(settings.DATABASE_URL, connect_args=connect_args)
    from sqlalchemy.orm import sessionmaker

    sess = sessionmaker(bind=eng)()
    try:
        providers = sess.execute(select(Provider)).scalars().all()
        for p in providers:
            sync_provider_models(sess, p)
    finally:
        sess.close()

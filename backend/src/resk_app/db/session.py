"""FastAPI dependency that yields a database session."""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy.orm import Session

from resk_app.db.base import get_session_factory


def get_db() -> Generator[Session, None, None]:
    db = get_session_factory()()
    try:
        yield db
    finally:
        db.close()

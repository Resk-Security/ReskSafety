"""Database seeding: default admin user + default capabilities."""

from __future__ import annotations

import uuid

from sqlalchemy import select

from resk_app.auth.passwords import hash_password
from resk_app.db.base import get_session_factory
from resk_app.models.capability import Capability
from resk_app.models.user import User
from resk_app.rbac.capabilities import DEFAULT_CAPABILITIES


def _seed_admin_user(session) -> None:
    existing = session.scalar(select(User).where(User.username == "admin"))
    if existing is not None:
        return
    admin = User(
        id=uuid.uuid4(),
        username="admin",
        email="admin@example.com",
        hashed_password=hash_password("changeme"),
        is_active=True,
        is_admin=True,
    )
    session.add(admin)
    session.commit()


def _seed_capabilities(session) -> None:
    for cap in DEFAULT_CAPABILITIES:
        existing = session.get(Capability, cap["bit_position"])
        if existing is None:
            session.add(
                Capability(
                    bit_position=cap["bit_position"],
                    name=cap["name"],
                    description=cap["description"],
                )
            )
    session.commit()


def run_seed() -> None:
    session = get_session_factory()()
    try:
        _seed_capabilities(session)
        _seed_admin_user(session)
    finally:
        session.close()


def run_seed_prod() -> None:
    """Extended seed (users, roles, policies, provider)."""
    from resk_app.seed_prod_data import run_seed_prod as _run_seed_prod
    _run_seed_prod()


def run_seed_logs() -> None:
    """Log seed (request logs, sessions, changelog)."""
    from resk_app.seed_logs import run_seed_logs as _run_seed_logs
    _run_seed_logs()

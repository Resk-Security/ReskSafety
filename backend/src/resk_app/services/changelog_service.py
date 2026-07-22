from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from resk_app.models.changelog import ChangeLog


def log_change(
    db: Session,
    actor: str,
    entity_type: str,
    entity_id: str,
    action: str,
    field: str | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
    summary: str | None = None,
) -> ChangeLog:
    entry = ChangeLog(
        actor=actor,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        field=field,
        old_value=old_value,
        new_value=new_value,
        summary=summary,
    )
    db.add(entry)
    db.commit()
    return entry


def get_changelog(
    db: Session,
    limit: int = 50,
    offset: int = 0,
    entity_type: str | None = None,
) -> list[ChangeLog]:
    q = select(ChangeLog).order_by(ChangeLog.created_at.desc())
    if entity_type:
        q = q.where(ChangeLog.entity_type == entity_type)
    q = q.limit(limit).offset(offset)
    return list(db.scalars(q).all())
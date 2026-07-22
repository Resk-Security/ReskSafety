"""Memory service: store, retrieve, summarize, and truncate session memory."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from resk_app.models.memory import MemoryEntry

INJECT_MODES = {"always", "first_only", "every_n", "never"}


def store_turn(
    db: Session,
    session_id: str,
    role: str = "user",
    content: str = "",
    turn_number: int | None = None,
    summary: str | None = None,
    token_count: int | None = None,
    priority: int = 0,
    inject_at: str = "never",
    inject_every_n: int | None = None,
) -> MemoryEntry:
    if turn_number is None:
        last = db.execute(
            select(MemoryEntry)
            .where(MemoryEntry.session_id == session_id)
            .order_by(MemoryEntry.turn_number.desc())
            .limit(1)
        ).scalar_one_or_none()
        turn_number = (last.turn_number + 1) if last else 0

    entry = MemoryEntry(
        session_id=session_id,
        turn_number=turn_number,
        role=role,
        content=content,
        summary=summary,
        token_count=token_count,
        priority=priority,
        inject_at=inject_at if inject_at in INJECT_MODES else "never",
        inject_every_n=inject_every_n,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get_session_memory(
    db: Session,
    session_id: str,
    limit: int = 100,
    offset: int = 0,
) -> list[MemoryEntry]:
    stmt = (
        select(MemoryEntry)
        .where(MemoryEntry.session_id == session_id)
        .order_by(MemoryEntry.turn_number.asc(), MemoryEntry.created_at.asc())
        .offset(offset)
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())


def get_memory_entry(db: Session, entry_id: uuid.UUID) -> MemoryEntry | None:
    return db.get(MemoryEntry, entry_id)


def update_memory_entry(db: Session, entry: MemoryEntry, **kwargs: Any) -> MemoryEntry:
    for key, value in kwargs.items():
        if value is not None and hasattr(entry, key):
            setattr(entry, key, value)
    db.commit()
    db.refresh(entry)
    return entry


def delete_memory_entry(db: Session, entry: MemoryEntry) -> None:
    db.delete(entry)
    db.commit()


def get_relevant_context(
    db: Session,
    session_id: str,
    max_tokens: int = 2000,
    strategy: str = "truncate",
) -> str:
    """Build context string from session memory, respecting max_tokens and strategy."""
    entries = get_session_memory(db, session_id, limit=500)

    if not entries:
        return ""

    if strategy == "summarize":
        summaries = [e.summary or e.content[:200] for e in entries if e.summary or e.content]
        return "\n".join(summaries)

    if strategy == "fail":
        total = sum(e.token_count or len(e.content) // 4 for e in entries)
        if total > max_tokens:
            raise MemoryError("Context window full")
        return "\n".join(e.content for e in entries)

    # truncate or roll_window: keep most recent turns within limit
    lines: list[str] = []
    token_estimate = 0
    for e in reversed(entries):
        text = e.content
        est = e.token_count or len(text) // 4
        if token_estimate + est > max_tokens:
            break
        lines.insert(0, text)
        token_estimate += est

    return "\n".join(lines)


def summarize_old_turns(db: Session, session_id: str, keep_last: int = 5) -> int:
    """Summarize turns older than `keep_last` into summary fields.
    
    Uses a simple truncation summary (first 150 chars). For production,
    replace with a call to the LLM.
    """
    entries = get_session_memory(db, session_id, limit=500)
    if len(entries) <= keep_last:
        return 0

    summarized = 0
    for e in entries[:-keep_last]:
        if not e.summary and e.content:
            e.summary = e.content[:150] + ("..." if len(e.content) > 150 else "")
            e.content = ""
            summarized += 1

    if summarized:
        db.commit()

    return summarized


def get_injectable_context(
    db: Session,
    session_id: str,
    turn_number: int,
    injection_rules: list[dict] | None = None,
) -> str:
    """Return context blocks that should be injected at this turn based on rules."""
    if not injection_rules:
        return ""

    blocks: list[str] = []
    for rule in injection_rules:
        field = rule.get("field", "")
        turn = rule.get("turn", "never")
        content = rule.get("content", "")

        if turn == "first_only" and turn_number > 0:
            continue
        if turn == "every_n":
            n = rule.get("n", 1)
            if turn_number % n != 0:
                continue
        if turn == "never":
            continue

        if field == "date":
            from datetime import datetime, timezone
            blocks.append(f"Current date: {datetime.now(timezone.utc).isoformat()}")
        elif field == "user_profile":
            blocks.append(f"User info: {content}")
        elif field == "custom":
            blocks.append(content)

    return "\n".join(blocks)


def count_session_tokens(db: Session, session_id: str) -> int:
    entries = get_session_memory(db, session_id, limit=500)
    return sum(e.token_count or len(e.content) // 4 for e in entries)

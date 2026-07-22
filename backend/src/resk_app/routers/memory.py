"""Memory router: session memory CRUD and summarization."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from resk_app.auth.dependencies import CurrentAdmin, get_current_admin
from resk_app.db.session import get_db
from resk_app.schemas.memory import (
    MemoryEntryIn,
    MemoryEntryOut,
    MemoryEntryUpdate,
    MemorySummarizeRequest,
)
from resk_app.services import memory_service

router = APIRouter(prefix="/api/sessions", tags=["memory"])


@router.get("/{session_id}/memory", response_model=list[MemoryEntryOut])
def list_memory(
    session_id: str,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    return [
        _to_out(e) for e in memory_service.get_session_memory(db, session_id, limit=limit, offset=offset)
    ]


@router.post("/{session_id}/memory", response_model=MemoryEntryOut, status_code=201)
def add_memory(
    session_id: str,
    body: MemoryEntryIn,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    entry = memory_service.store_turn(
        db,
        session_id=session_id,
        role=body.role,
        content=body.content,
        turn_number=body.turn_number,
        summary=body.summary,
        token_count=body.token_count,
        priority=body.priority,
        inject_at=body.inject_at,
        inject_every_n=body.inject_every_n,
    )
    return _to_out(entry)


@router.put("/{session_id}/memory/{entry_id}", response_model=MemoryEntryOut)
def update_memory(
    session_id: str,
    entry_id: uuid.UUID,
    body: MemoryEntryUpdate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    entry = memory_service.get_memory_entry(db, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Memory entry not found")
    entry = memory_service.update_memory_entry(
        db, entry,
        content=body.content,
        summary=body.summary,
        priority=body.priority,
        inject_at=body.inject_at,
        inject_every_n=body.inject_every_n,
    )
    return _to_out(entry)


@router.delete("/{session_id}/memory/{entry_id}", status_code=204)
def delete_memory(
    session_id: str,
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    entry = memory_service.get_memory_entry(db, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Memory entry not found")
    memory_service.delete_memory_entry(db, entry)


@router.post("/{session_id}/memory/summarize")
def summarize_memory(
    session_id: str,
    body: MemorySummarizeRequest,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
):
    summarized = memory_service.summarize_old_turns(db, session_id, keep_last=5)
    total_tokens = memory_service.count_session_tokens(db, session_id)
    return {"summarized": summarized, "total_tokens": total_tokens, "session_id": session_id}


@router.get("/{session_id}/memory/context")
def get_context(
    session_id: str,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
    max_tokens: int = Query(2000, ge=100, le=100_000),
    strategy: str = Query("truncate"),
):
    try:
        context = memory_service.get_relevant_context(
            db, session_id, max_tokens=max_tokens, strategy=strategy,
        )
        return {"context": context, "tokens_estimate": len(context) // 4}
    except MemoryError:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Context window full")


def _to_out(e) -> MemoryEntryOut:
    return MemoryEntryOut(
        id=e.id,
        session_id=e.session_id,
        turn_number=e.turn_number,
        role=e.role,
        content=e.content,
        summary=e.summary,
        token_count=e.token_count,
        priority=e.priority,
        inject_at=e.inject_at,
        inject_every_n=e.inject_every_n,
        created_at=e.created_at,
    )

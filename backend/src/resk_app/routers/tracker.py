"""Visitor analytics tracker for demo."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from resk_app.db.base import Base, get_session_factory
from resk_app.limiter import limiter

router = APIRouter(prefix="/api", tags=["tracker"])


class TrackEvent(Base):
    __tablename__ = "tracker_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    visitor_id: Mapped[str] = mapped_column(String(64), index=True)
    event: Mapped[str] = mapped_column(String(64), index=True)
    data: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class TrackRequest(BaseModel):
    visitor_id: str
    event: str
    data: dict | None = None
    ts: str | None = None


@router.post("/track")
@limiter.limit("30/minute")
def track_event(body: TrackRequest, request: Request) -> dict:
    session = get_session_factory()()
    try:
        evt = TrackEvent(
            id=uuid.uuid4(),
            visitor_id=body.visitor_id,
            event=body.event,
            data=str(body.data or {}),
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent", "")[:512],
        )
        session.add(evt)
        session.commit()
    finally:
        session.close()
    return {"ok": True}

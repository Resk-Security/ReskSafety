"""Sessions router: endpoints for agent session tracking via reskPoints bridge."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from resk_app.auth.dependencies import CurrentAdmin, CurrentUser, get_current_admin, get_current_user
from resk_app.db.session import get_db
from resk_app.models.user import User
from resk_app.schemas.session import (
    RecordActionIn,
    SessionOut,
    SessionStatsOut,
    ToolCallOut,
)
from resk_app.services.session_service import (
    get_session_tools,
    get_user_session_stats,
    record_action,
)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("/user/{user_id}")
def list_user_sessions(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[SessionOut]:
    from resk_app.services.session_service import get_user_sessions

    sessions = get_user_sessions(db, user_id, limit=limit, offset=offset)
    return [SessionOut(**s.to_dict()) for s in sessions]


@router.get("/me/stats")
def my_session_stats(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Get session stats for the currently authenticated user."""
    stats = get_user_session_stats(db, user.id)
    return {
        "user_id": str(user.id),
        "username": user.username,
        "email": user.email if hasattr(user, "email") else None,
        **stats,
    }


@router.get("/user/{user_id}/tools")
def list_session_tools(
    user_id: uuid.UUID,
    session_id: str = Query(..., description="Filter by session ID"),
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> list[ToolCallOut]:
    tools = get_session_tools(db, session_id)
    return [ToolCallOut(**t.to_dict()) for t in tools]


@router.get("/user/{user_id}/stats")
def user_session_stats(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> SessionStatsOut:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    stats = get_user_session_stats(db, user_id)
    return SessionStatsOut(**stats)


@router.post("/record", status_code=status.HTTP_200_OK)
def record(
    body: RecordActionIn,
    db: Session = Depends(get_db),
    api_key: str | None = None,
) -> SessionOut:
    """Internal webhook endpoint for reskPoints platforms to push action logs.
    
    Can be called with an API key header `X-API-Key` matching the configured
    `RESKPOINTS_API_KEY` env var for simple auth.
    """
    from resk_app.config import get_settings

    settings = __import__("resk_app.config", fromlist=["get_settings"]).get_settings()
    expected_key = getattr(settings, "RESKPOINTS_API_KEY", None)
    if expected_key and (api_key or "") != expected_key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API key")

    uid = uuid.UUID(body.user_id) if body.user_id else None
    if uid and not db.get(User, uid):
        raise HTTPException(status_code=404, detail="User not found")

    sess = record_action(
        db,
        user_id=uid,
        session_id=body.session_id,
        agent_id=body.agent_id,
        agent_type=body.agent_type,
        action=body.action,
        tokens_in=body.tokens_in,
        tokens_out=body.tokens_out,
        tools=body.tools,
        success=body.success,
        duration_ms=body.duration_ms,
        metadata=body.metadata,
    )
    return SessionOut(**sess.to_dict())
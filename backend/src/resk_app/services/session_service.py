"""Bridge between reskPoints ActionLogs and RESK app database.

Exposes an internal webhook-like endpoint that reskPoints platforms
can POST to, recording sessions, tokens, and tool calls.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from resk_app.models.session import AgentSession, ToolCall


def record_action(
    db: Session,
    *,
    user_id: uuid.UUID | None = None,
    session_id: str,
    agent_id: str,
    agent_type: str = "opencode",
    action: str = "",
    tokens_in: int = 0,
    tokens_out: int = 0,
    tools: list[dict] | None = None,
    success: bool = True,
    duration_ms: float | None = None,
    metadata: dict | None = None,
) -> AgentSession:
    """Record or update an agent session from a reskPoints ActionLog."""
    now = datetime.now(timezone.utc)

    sess = db.scalar(
        select(AgentSession).where(
            AgentSession.session_id == session_id,
            AgentSession.agent_id == agent_id,
        )
    )
    if sess is None:
        sess = AgentSession(
            user_id=user_id,
            session_id=session_id,
            agent_id=agent_id,
            agent_type=agent_type,
            status="active",
            started_at=now,
        )
        db.add(sess)

    sess.last_seen_at = now
    sess.tokens_in += tokens_in
    sess.tokens_out += tokens_out
    sess.total_tokens = sess.tokens_in + sess.tokens_out

    if tools:
        existing_tools = set(sess.tools_connected or [])
        for t in tools:
            name = t.get("name") or t.get("tool_name", "")
            if name and name not in existing_tools:
                existing_tools.add(name)
        sess.tools_connected = sorted(existing_tools)

    if action == "session_end":
        sess.status = "completed"
    if action == "session_error":
        sess.status = "error"

    if metadata:
        if sess.meta_data:
            sess.meta_data.update(metadata)
        else:
            sess.meta_data = metadata

    db.commit()
    db.refresh(sess)

    # Record tool calls
    if tools:
        for t in (tools or []):
            tc = ToolCall(
                session_id=session_id,
                agent_id=agent_id,
                tool_name=t.get("name") or t.get("tool_name", "unknown"),
                tool_type=t.get("type", "function"),
                duration_ms=int(t.get("duration_ms", 0)) if t.get("duration_ms") else None,
                tokens_cost=int(t.get("tokens_cost", t.get("tokens", 0))),
                success=t.get("success", True),
                parameters=t.get("parameters", {}),
                result_summary=str(t.get("result", ""))[:500] if t.get("result") else None,
            )
            db.add(tc)
        db.commit()

    return sess


def get_user_sessions(
    db: Session,
    user_id: uuid.UUID,
    limit: int = 20,
    offset: int = 0,
) -> list[AgentSession]:
    """Return sessions for a user, most recent first."""
    results = db.scalars(
        select(AgentSession)
        .where(AgentSession.user_id == user_id)
        .order_by(AgentSession.last_seen_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return list(results)


def get_session_tools(
    db: Session,
    session_id: str,
    limit: int = 50,
) -> list[ToolCall]:
    results = db.scalars(
        select(ToolCall)
        .where(ToolCall.session_id == session_id)
        .order_by(ToolCall.created_at.desc())
        .limit(limit)
    ).all()
    return list(results)


def get_user_session_stats(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    """Aggregated session/token/tool stats for a user."""
    rows = db.scalars(
        select(AgentSession).where(AgentSession.user_id == user_id)
    ).all()

    total_tokens = sum(r.total_tokens for r in rows)
    total_tools = set()
    for r in rows:
        for t in (r.tools_connected or []):
            total_tools.add(t)

    by_day_q = (
        select(
            func.date(AgentSession.last_seen_at).label("day"),
            func.sum(AgentSession.tokens_in + AgentSession.tokens_out).label("tokens"),
            func.count(AgentSession.id).label("sessions"),
        )
        .where(AgentSession.user_id == user_id)
        .group_by(func.date(AgentSession.last_seen_at))
        .order_by(func.date(AgentSession.last_seen_at).desc())
        .limit(30)
    )
    daily = db.execute(by_day_q).all()

    return {
        "total_sessions": len(rows),
        "active_sessions": sum(1 for r in rows if r.status == "active"),
        "completed_sessions": sum(1 for r in rows if r.status == "completed"),
        "total_tokens": total_tokens,
        "unique_tools": sorted(total_tools),
        "unique_agents": len(set(r.agent_id for r in rows)),
        "daily": [
            {"date": str(d.day), "tokens": int(d.tokens or 0), "sessions": int(d.sessions)}
            for d in daily
        ],
    }
"""Admin router: stats, logs, observability config, security test, graph."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from resk_app.auth.dependencies import CurrentAdmin, CurrentUser, get_current_admin, get_current_user
from resk_app.db.session import get_db
from resk_app.models.capability import Capability
from resk_app.models.changelog import ChangeLog
from resk_app.models.log import RequestLog
from resk_app.models.policy import Policy
from resk_app.models.provider import Provider
from resk_app.models.role import Role
from resk_app.models.session import AgentSession
from resk_app.models.user import User
from resk_app.services.changelog_service import get_changelog
from resk_app.services.security_service import (
    get_config,
    get_patterns_content,
    get_policy_content,
    save_config,
    save_patterns_file,
    save_policy_file,
    test_security,
)
from resk_app.schemas.admin import (
    ChangeLogOut,
    GraphLink,
    GraphNode,
    GraphResponse,
    LogOut,
    StatsResponse,
)
from resk_app.schemas.security import (
    SecurityConfig,
    SecurityTestRequest,
    SecurityTestResult,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats")
def stats(
    _: CurrentAdmin = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> StatsResponse:
    total = db.scalar(select(func.count(RequestLog.id))) or 0
    blocked = db.scalar(
        select(func.count(RequestLog.id)).where(RequestLog.status == "blocked")
    ) or 0
    success = db.scalar(
        select(func.count(RequestLog.id)).where(RequestLog.status == "success")
    ) or 0
    error = db.scalar(
        select(func.count(RequestLog.id)).where(RequestLog.status == "error")
    ) or 0

    by_user_rows = db.execute(
        select(User.username, func.count(RequestLog.id))
        .join(RequestLog, RequestLog.user_id == User.id, isouter=True)
        .group_by(User.username)
    ).all()
    by_user = {(u or "unknown"): c for u, c in by_user_rows}

    by_rule_rows = db.execute(
        select(RequestLog.blocked_phrase, func.count(RequestLog.id))
        .where(RequestLog.status == "blocked")
        .group_by(RequestLog.blocked_phrase)
    ).all()
    by_rule = {(r or "unknown"): c for r, c in by_rule_rows}

    by_policy_rows = db.execute(
        select(Policy.name, func.count(RequestLog.id))
        .join(RequestLog, RequestLog.policy_id == Policy.id)
        .where(RequestLog.status == "blocked")
        .group_by(Policy.name)
    ).all()
    by_policy = {p: c for p, c in by_policy_rows}

    return StatsResponse(
        total_requests=total,
        blocked_requests=blocked,
        success_requests=success,
        error_requests=error,
        blocked_ratio=(blocked / total) if total else 0.0,
        by_user=by_user,
        by_rule=by_rule,
        by_policy=by_policy,
    )


@router.get("/logs")
def logs(
    _: CurrentAdmin = Depends(get_current_admin),
    db: Session = Depends(get_db),
    user_id: uuid.UUID | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    phrase: str | None = Query(None),
    since: datetime | None = Query(None),
    until: datetime | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[LogOut]:
    q = select(RequestLog).order_by(RequestLog.created_at.desc())
    if user_id is not None:
        q = q.where(RequestLog.user_id == user_id)
    if status_filter is not None:
        q = q.where(RequestLog.status == status_filter)
    if phrase is not None:
        q = q.where(RequestLog.blocked_phrase.ilike(f"%{phrase}%"))
    if since is not None:
        q = q.where(RequestLog.created_at >= since)
    if until is not None:
        q = q.where(RequestLog.created_at <= until)
    q = q.limit(limit).offset(offset)
    rows = db.scalars(q).all()
    return [
        LogOut(
            id=str(r.id),
            user_id=str(r.user_id) if r.user_id else None,
            policy_id=str(r.policy_id) if r.policy_id else None,
            status=r.status,
            backend_type=r.backend_type,
            model=r.model,
            blocked_phrase=r.blocked_phrase,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.get("/logs/me")
def my_logs(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    status_filter: str | None = Query(None, alias="status"),
    phrase: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[LogOut]:
    """Get audit logs for the currently authenticated user only."""
    q = (
        select(RequestLog)
        .where(RequestLog.user_id == user.id)
        .order_by(RequestLog.created_at.desc())
    )
    if status_filter is not None:
        q = q.where(RequestLog.status == status_filter)
    if phrase is not None:
        q = q.where(RequestLog.blocked_phrase.ilike(f"%{phrase}%"))
    q = q.limit(limit).offset(offset)
    rows = db.scalars(q).all()
    return [
        LogOut(
            id=str(r.id),
            user_id=str(r.user_id) if r.user_id else None,
            policy_id=str(r.policy_id) if r.policy_id else None,
            status=r.status,
            backend_type=r.backend_type,
            model=r.model,
            blocked_phrase=r.blocked_phrase,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.get("/graph", response_model=GraphResponse)
def graph(
    _: CurrentAdmin = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> GraphResponse:
    nodes: dict[str, GraphNode] = {}
    links: list[GraphLink] = []
    seen = set()

    def add_link(src: str, tgt: str, kind: str) -> None:
        k = f"{src}->{tgt}"
        if k not in seen:
            seen.add(k)
            links.append(GraphLink(source=src, target=tgt, type=kind))

    # ── Users ──
    users = db.execute(select(User)).scalars().all()
    for u in users:
        uid = str(u.id)
        nodes[uid] = GraphNode(id=uid, label=u.username, group="user")

    # ── Sessions ──
    sessions = db.execute(select(AgentSession)).scalars().all()
    for s in sessions:
        sid = f"session:{s.agent_id or s.session_id}"
        if sid not in nodes:
            nodes[sid] = GraphNode(id=sid, label=s.agent_id or s.session_id[:8], group="session")
        if s.user_id:
            add_link(str(s.user_id), sid, "uses")
        for tool in (s.tools_connected or []):
            tid = f"tool:{tool}"
            if tid not in nodes:
                nodes[tid] = GraphNode(id=tid, label=tool, group="tool")
            add_link(sid, tid, "connects_to")

    # ── Providers ──
    providers = db.execute(select(Provider)).scalars().all()
    for p in providers:
        pid = f"provider:{p.id}"
        if pid not in nodes:
            nodes[pid] = GraphNode(id=pid, label=p.name, group="provider")

    if providers:
        for s in sessions:
            sid = f"session:{s.agent_id or s.session_id}"
            for p in providers:
                add_link(sid, f"provider:{p.id}", "routed_to")

    # ── Roles ──
    roles = db.execute(select(Role)).scalars().all()
    for r in roles:
        rid = f"role:{r.id}"
        if rid not in nodes:
            nodes[rid] = GraphNode(id=rid, label=r.name, group="role")

    from resk_app.models.user import user_roles
    user_role_rows = db.execute(select(user_roles)).all()
    for ur in user_role_rows:
        uid = str(ur.user_id)
        rid = f"role:{ur.role_id}"
        if uid in nodes and rid in nodes:
            add_link(uid, rid, "assigned")

    # ── Policies ──
    policies = db.execute(select(Policy)).scalars().all()
    for pl in policies:
        pid = f"policy:{pl.id}"
        if pid not in nodes:
            rules_count = len(pl.rules or [])
            label = f"{pl.name} ({rules_count} rules)"
            nodes[pid] = GraphNode(id=pid, label=label, group="policy")

    from resk_app.models.role import role_policies
    rp_rows = db.execute(select(role_policies)).all()
    for rp in rp_rows:
        rid = f"role:{rp.role_id}"
        pid = f"policy:{rp.policy_id}"
        if rid in nodes and pid in nodes:
            add_link(rid, pid, "enforces")

    # ── Capabilities ──
    capabilities = db.execute(select(Capability)).scalars().all()
    for c in capabilities:
        cid = f"capability:{c.bit_position}"
        if cid not in nodes:
            nodes[cid] = GraphNode(id=cid, label=c.name, group="capability")

    for r in roles:
        rid = f"role:{r.id}"
        mask = r.capabilities_mask or 0
        for c in capabilities:
            if mask & (1 << c.bit_position):
                cid = f"capability:{c.bit_position}"
                add_link(rid, cid, "grants")

    return GraphResponse(nodes=list(nodes.values()), links=links)


@router.get("/changelog", response_model=list[ChangeLogOut])
def changelog(
    _: CurrentAdmin = Depends(get_current_admin),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    entity_type: str | None = Query(None),
):
    return get_changelog(db, limit=limit, offset=offset, entity_type=entity_type)


# ─── Observability Config ─────────────────────────────────────────


@router.get("/observability/config", response_model=SecurityConfig)
def get_observability_config(
    _: CurrentAdmin = Depends(get_current_admin),
):
    """Get the full security config (observability is the only active section here)."""
    return get_config()


@router.put("/observability/config", response_model=SecurityConfig)
def put_observability_config(
    config: SecurityConfig,
    _: CurrentAdmin = Depends(get_current_admin),
):
    return save_config(config)


# ─── Security Test ────────────────────────────────────────────────


@router.post("/security/test", response_model=SecurityTestResult)
def security_test(
    body: SecurityTestRequest,
    _: CurrentAdmin = Depends(get_current_admin),
):
    return test_security(body)


@router.get("/health", status_code=status.HTTP_200_OK)
def health(_current: CurrentAdmin = Depends(get_current_admin)) -> dict:
    return {"status": "ok"}

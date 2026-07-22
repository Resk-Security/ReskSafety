"""Admin schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class StatsResponse(BaseModel):
    total_requests: int
    blocked_requests: int
    success_requests: int
    error_requests: int
    blocked_ratio: float
    by_user: dict[str, int] = {}
    by_rule: dict[str, int] = {}


class LogFilter(BaseModel):
    user_id: str | None = None
    status: str | None = None
    phrase: str | None = None
    since: datetime | None = None
    until: datetime | None = None
    limit: int = 50
    offset: int = 0


class LogOut(BaseModel):
    id: str
    user_id: str | None
    policy_id: str | None
    status: str
    backend_type: str
    model: str
    blocked_phrase: str | None
    created_at: datetime


class GraphNode(BaseModel):
    id: str
    label: str
    group: str  # user | tool | provider | session


class GraphLink(BaseModel):
    source: str
    target: str
    type: str  # uses | connects_to | routed_to


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    links: list[GraphLink]


class ChangeLogOut(BaseModel):
    id: int
    actor: str
    entity_type: str
    entity_id: str
    action: str
    field: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    summary: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

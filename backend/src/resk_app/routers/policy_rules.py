"""Standalone PolicyRule CRUD."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from resk_app.auth.dependencies import CurrentAdmin, get_current_admin
from resk_app.db.session import get_db
from resk_app.models.policy import Policy
from resk_app.models.policy_rule import PolicyRule
from resk_app.schemas.policy import PolicyRuleCreate, PolicyRuleOut, PolicyRuleUpdate

router = APIRouter(prefix="/api/policy-rules", tags=["policy-rules"])


def _out(r: PolicyRule) -> PolicyRuleOut:
    return PolicyRuleOut(
        id=r.id,
        name=r.name,
        description=r.description,
        rule_type=r.rule_type,
        phrases=r.phrases or [],
        mode=r.mode,
        penalty=r.penalty,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


@router.get("")
def list_rules(
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> list[PolicyRuleOut]:
    items = db.scalars(select(PolicyRule).order_by(PolicyRule.name)).all()
    return [_out(r) for r in items]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_rule(
    body: PolicyRuleCreate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> PolicyRuleOut:
    rule = PolicyRule(
        name=body.name,
        description=body.description,
        rule_type=body.rule_type,
        phrases=body.phrases,
        mode=body.mode,
        penalty=body.penalty,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _out(rule)


@router.put("/{rule_id}")
def update_rule(
    rule_id: uuid.UUID,
    body: PolicyRuleUpdate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> PolicyRuleOut:
    rule = db.get(PolicyRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    if body.name is not None:
        rule.name = body.name
    if body.description is not None:
        rule.description = body.description
    if body.rule_type is not None:
        rule.rule_type = body.rule_type
    if body.phrases is not None:
        rule.phrases = body.phrases
    if body.mode is not None:
        rule.mode = body.mode
    if body.penalty is not None:
        rule.penalty = body.penalty
    db.commit()
    db.refresh(rule)
    return _out(rule)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(
    rule_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> None:
    rule = db.get(PolicyRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()

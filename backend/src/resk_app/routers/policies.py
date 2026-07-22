"""Policy CRUD + preview + YAML import/export."""

from __future__ import annotations

import io
import uuid
from typing import Any

import yaml
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from resk_app.auth.dependencies import CurrentAdmin, get_current_admin
from resk_app.cache.trie_cache import invalidate_policy
from resk_app.db.session import get_db
from resk_app.models.policy import Policy
from resk_app.models.policy_config import PolicyConfig
from resk_app.models.policy_rule import PolicyRule
from resk_app.schemas.policy import (
    PolicyCreate,
    PolicyOut,
    PolicyPreviewRequest,
    PolicyPreviewResponse,
    PolicyRuleBase,
    PolicyRuleCreate,
    PolicyRuleOut,
    PolicyRuleUpdate,
    PolicyUpdate,
)
from resk_app.services.policy_service import preview_rules

router = APIRouter(prefix="/api/policies", tags=["policies"])


def _rule_to_out(r: PolicyRule) -> PolicyRuleOut:
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


def _out(p: Policy) -> PolicyOut:
    return PolicyOut(
        id=p.id,
        name=p.name,
        description=p.description,
        mask=p.mask,
        rules=[_rule_to_out(r) for r in (p.rules or [])],
        semantic_detection=p.semantic_detection,
        access_control=p.access_control,
        classifiers=p.classifiers,
        scanning_pipeline=p.scanning_pipeline,
        memory_injection_rules=p.memory_injection_rules,
        context_strategy=p.context_strategy,
        semantic_detection_config_id=p.semantic_detection_config_id,
        access_control_config_id=p.access_control_config_id,
        classifiers_config_id=p.classifiers_config_id,
        scanning_pipeline_config_id=p.scanning_pipeline_config_id,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def _sync_rules(db: Session, policy: Policy, rules_in: list[PolicyRuleCreate]) -> None:
    """Replace the policy's rule set with the given list (create/delete as needed)."""
    old_ids = {r.id for r in policy.rules}
    new_ids: set[uuid.UUID] = set()
    kept: list[PolicyRule] = []

    for r_data in rules_in:
        if hasattr(r_data, "id") and r_data.id and r_data.id in old_ids:
            rule = db.get(PolicyRule, r_data.id)
            if rule:
                for field in ("name", "description", "rule_type", "phrases", "mode", "penalty"):
                    val = getattr(r_data, field, None)
                    if val is not None:
                        setattr(rule, field, val)
                new_ids.add(rule.id)
                kept.append(rule)
                continue
        rule = PolicyRule(
            name=r_data.name,
            description=r_data.description,
            rule_type=r_data.rule_type,
            phrases=r_data.phrases or [],
            mode=r_data.mode,
            penalty=r_data.penalty,
        )
        db.add(rule)
        db.flush()
        new_ids.add(rule.id)
        kept.append(rule)

    to_remove = old_ids - new_ids
    for rid in to_remove:
        rule = db.get(PolicyRule, rid)
        if rule:
            db.delete(rule)

    policy.rules = kept


@router.get("")
def list_policies(
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> list[PolicyOut]:
    items = db.scalars(select(Policy).order_by(Policy.name)).all()
    return [_out(p) for p in items]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_policy(
    body: PolicyCreate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> PolicyOut:
    if db.scalar(select(Policy).where(Policy.name == body.name)):
        raise HTTPException(status_code=409, detail="Policy name exists")

    # Resolve config references
    if body.semantic_detection_config_id:
        cfg = db.get(PolicyConfig, body.semantic_detection_config_id)
        if cfg and cfg.config_type == "semantic_detection":
            body.semantic_detection = None  # prefer standalone config
    if body.access_control_config_id:
        cfg = db.get(PolicyConfig, body.access_control_config_id)
        if cfg and cfg.config_type == "access_control":
            body.access_control = None
    if body.classifiers_config_id:
        cfg = db.get(PolicyConfig, body.classifiers_config_id)
        if cfg and cfg.config_type == "classifiers":
            body.classifiers = None
    if body.scanning_pipeline_config_id:
        cfg = db.get(PolicyConfig, body.scanning_pipeline_config_id)
        if cfg and cfg.config_type == "scanning_pipeline":
            body.scanning_pipeline = None

    p = Policy(
        name=body.name,
        description=body.description,
        mask=body.mask,
        semantic_detection=body.semantic_detection.model_dump() if body.semantic_detection else None,
        access_control=body.access_control.model_dump() if body.access_control else None,
        classifiers=body.classifiers.model_dump() if body.classifiers else None,
        scanning_pipeline=body.scanning_pipeline.model_dump() if body.scanning_pipeline else None,
        semantic_detection_config_id=body.semantic_detection_config_id,
        access_control_config_id=body.access_control_config_id,
        classifiers_config_id=body.classifiers_config_id,
        scanning_pipeline_config_id=body.scanning_pipeline_config_id,
    )
    db.add(p)
    db.flush()

    if body.rules:
        _sync_rules(db, p, body.rules)

    db.commit()
    db.refresh(p)
    return _out(p)


@router.get("/{policy_id}")
def get_policy(
    policy_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> PolicyOut:
    p = db.get(Policy, policy_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Policy not found")
    return _out(p)


@router.put("/{policy_id}")
def update_policy(
    policy_id: uuid.UUID,
    body: PolicyUpdate,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> PolicyOut:
    p = db.get(Policy, policy_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Policy not found")

    if body.name is not None:
        p.name = body.name
    if body.description is not None:
        p.description = body.description
    if body.mask is not None:
        p.mask = body.mask
    if body.semantic_detection_config_id is not None:
        p.semantic_detection_config_id = body.semantic_detection_config_id
        cfg = db.get(PolicyConfig, body.semantic_detection_config_id) if body.semantic_detection_config_id else None
        if cfg and cfg.config_type == "semantic_detection":
            p.semantic_detection = cfg.config
    if body.semantic_detection is not None:
        p.semantic_detection = body.semantic_detection.model_dump()
        if body.semantic_detection_config_id is None:
            p.semantic_detection_config_id = None
    if body.access_control_config_id is not None:
        p.access_control_config_id = body.access_control_config_id
        cfg = db.get(PolicyConfig, body.access_control_config_id) if body.access_control_config_id else None
        if cfg and cfg.config_type == "access_control":
            p.access_control = cfg.config
    if body.access_control is not None:
        p.access_control = body.access_control.model_dump()
        if body.access_control_config_id is None:
            p.access_control_config_id = None
    if body.classifiers_config_id is not None:
        p.classifiers_config_id = body.classifiers_config_id
        cfg = db.get(PolicyConfig, body.classifiers_config_id) if body.classifiers_config_id else None
        if cfg and cfg.config_type == "classifiers":
            p.classifiers = cfg.config
    if body.classifiers is not None:
        p.classifiers = body.classifiers.model_dump()
        if body.classifiers_config_id is None:
            p.classifiers_config_id = None
    if body.scanning_pipeline_config_id is not None:
        p.scanning_pipeline_config_id = body.scanning_pipeline_config_id
        cfg = db.get(PolicyConfig, body.scanning_pipeline_config_id) if body.scanning_pipeline_config_id else None
        if cfg and cfg.config_type == "scanning_pipeline":
            p.scanning_pipeline = cfg.config
    if body.scanning_pipeline is not None:
        p.scanning_pipeline = body.scanning_pipeline.model_dump()
        if body.scanning_pipeline_config_id is None:
            p.scanning_pipeline_config_id = None
    if body.rules is not None:
        _sync_rules(db, p, body.rules)
    if body.memory_injection_rules is not None:
        p.memory_injection_rules = body.memory_injection_rules
    if body.context_strategy is not None:
        p.context_strategy = body.context_strategy

    db.commit()
    db.refresh(p)
    invalidate_policy(policy_id)
    return _out(p)


@router.delete("/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_policy(
    policy_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> None:
    p = db.get(Policy, policy_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Policy not found")
    db.delete(p)
    db.commit()
    invalidate_policy(policy_id)


@router.post("/preview")
def preview(
    body: PolicyPreviewRequest,
    _: CurrentAdmin = Depends(get_current_admin),
) -> PolicyPreviewResponse:
    rules_dicts = [
        {"phrases": r.phrases, "mode": r.mode, "penalty": r.penalty, "type": r.rule_type}
        for r in body.rules
    ]
    matched = preview_rules(body.text, rules_dicts)
    return PolicyPreviewResponse(
        blocked=bool(matched),
        matched_phrases=matched,
    )


def _rules_to_yaml_rules(rules: list[PolicyRule]) -> list[dict]:
    out: list[dict] = []
    for rule in rules:
        mode = rule.mode or "hard"
        penalty = rule.penalty or 0.0
        for phrase in (rule.phrases or []):
            entry: dict[str, Any] = {"phrase": phrase, "mode": mode}
            if mode == "bias" and penalty:
                entry["penalty"] = penalty
            out.append(entry)
    return out


def _yaml_rules_to_rules(yaml_rules: list[dict]) -> list[dict]:
    groups: dict[str, dict] = {}
    for item in yaml_rules or []:
        phrase = item.get("phrase", "")
        mode = item.get("mode", "hard")
        if mode == "hard":
            key = "hard|||"
        else:
            penalty = item.get("penalty", 5.0)
            key = f"bias|||{penalty}"
        if key not in groups:
            groups[key] = {"rule_type": "contains", "phrases": [], "mode": mode, "penalty": 0.0}
        groups[key]["phrases"].append(phrase)
        if mode == "bias":
            groups[key]["penalty"] = penalty

    out: list[dict] = []
    for key, val in groups.items():
        parts = key.split("|||")
        mode = parts[0]
        penalty = float(parts[1]) if len(parts) > 1 and parts[1] else 0.0
        out.append({
            "name": f"Imported rule {len(out) + 1}",
            "description": "",
            "rule_type": "contains",
            "phrases": val["phrases"],
            "mode": mode,
            "penalty": penalty if mode == "bias" else 0.0,
        })
    return out


def _policy_to_yaml(p: Policy) -> dict:
    data: dict[str, Any] = {
        "name": p.name,
        "description": p.description,
        "mask": p.mask,
        "rules": _rules_to_yaml_rules(p.rules or []),
    }
    if p.semantic_detection:
        data["semantic_detection"] = p.semantic_detection
    if p.access_control:
        data["access_control"] = p.access_control
    if p.classifiers:
        data["classifiers"] = p.classifiers
    return data


@router.get("/{policy_id}/export")
def export_yaml(
    policy_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: CurrentAdmin = Depends(get_current_admin),
) -> StreamingResponse:
    p = db.get(Policy, policy_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Policy not found")
    data = _policy_to_yaml(p)
    content = yaml.safe_dump(data, sort_keys=False, allow_unicode=True, default_flow_style=False)
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="application/x-yaml",
        headers={"Content-Disposition": f"attachment; filename={p.name}.yaml"},
    )


@router.post("/import", response_model=PolicyOut)
async def import_yaml(
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    _: CurrentAdmin = Depends(get_current_admin),
) -> PolicyOut:
    raw = (await file.read()).decode("utf-8", errors="replace")
    try:
        data = yaml.safe_load(raw)
    except yaml.YAMLError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="YAML root must be a mapping")
    name = data.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Missing 'name'")
    if db.scalar(select(Policy).where(Policy.name == name)):
        raise HTTPException(status_code=409, detail="Policy name exists")

    rule_dicts = _yaml_rules_to_rules(data.get("rules", []))
    rules = [
        PolicyRule(name=rd["name"], description=rd.get("description", ""),
                   rule_type=rd["rule_type"], phrases=rd["phrases"],
                   mode=rd["mode"], penalty=rd["penalty"])
        for rd in rule_dicts
    ]
    for r in rules:
        db.add(r)
    db.flush()

    p = Policy(
        name=name,
        description=data.get("description", ""),
        mask=data.get("mask"),
        semantic_detection=data.get("semantic_detection"),
        access_control=data.get("access_control"),
        classifiers=data.get("classifiers"),
        rules=rules,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _out(p)

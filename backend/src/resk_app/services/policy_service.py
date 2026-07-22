"""Policy service: loading, aggregation, preview."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from resk_app.llm.filter_bridge import CompiledPolicy, compile_policy, post_filter_text
from resk_app.models.policy import Policy
from resk_app.models.policy_rule import PolicyRule
from resk_app.models.role import Role
from resk_app.models.user import User


def _rules_to_dicts(rules: list[PolicyRule] | None) -> list[dict]:
    """Convert PolicyRule ORM objects to the dict format compile_policy expects."""
    out: list[dict] = []
    for r in rules or []:
        out.append({
            "phrases": r.phrases or [],
            "mode": r.mode or "hard",
            "penalty": r.penalty or 10.0,
            "type": r.rule_type or "contains",
        })
    return out


def get_user_policies(user: User, db: Session) -> list[Policy]:
    """Return distinct policies attached to the user's roles."""
    if not user.roles:
        return []
    seen: set[uuid.UUID] = set()
    out: list[Policy] = []
    for role in user.roles:
        for p in role.policies:
            if p.id not in seen:
                seen.add(p.id)
                out.append(p)
    return out


def aggregate_compiled(policies: list[Policy]) -> CompiledPolicy:
    """Merge multiple policies into one CompiledPolicy."""
    all_rules: list[dict] = []
    for p in policies:
        all_rules.extend(_rules_to_dicts(p.rules))
    return compile_policy(all_rules)


def get_compiled_policy_for_user(user: User, db: Session) -> CompiledPolicy | None:
    policies = get_user_policies(user, db)
    if not policies:
        return None
    return aggregate_compiled(policies)


def preview_rules(text: str, rules: list[dict]) -> list[str]:
    """Return matched banned phrases for a text (UI preview)."""
    compiled = compile_policy(rules)
    matched: list[str] = []
    lower = text.lower()
    for phrase in compiled.banned_phrases:
        if phrase and phrase.lower() in lower:
            matched.append(phrase)
    return matched

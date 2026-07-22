"""User mask computation: OR of role masks."""

from __future__ import annotations

from sqlalchemy.orm import Session

from resk_app.models.user import User
from resk_app.rbac.capabilities import merge_masks


def compute_user_mask(user: User) -> int:
    """Effective mask = OR of all role masks."""
    return merge_masks(r.capabilities_mask for r in user.roles)

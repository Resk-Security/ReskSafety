"""RBAC capability definitions and bitmask helpers.

A capability is a named bit (0..63). The bitmask is a 64-bit integer where each
set bit grants a capability. This layer is purely applicative and never reaches
`resklogits`, which only sees lists of banned tokens derived from Policies.
"""

from __future__ import annotations

from enum import IntEnum
from functools import reduce
from typing import Iterable


class Capability(IntEnum):
    """Default capability bits (editable via UI / DB)."""

    CAN_CALL_TOOLS = 0
    CAN_GENERATE_CODE = 1
    DB_READ = 2
    DB_WRITE = 3
    CAN_SEND_EMAIL = 4
    CAN_ACCESS_PII = 5
    CAN_MANAGE_USERS = 6
    CAN_CONFIGURE_SYSTEM = 7


DEFAULT_CAPABILITIES: list[dict] = [
    {"bit_position": 0, "name": "can_call_tools", "description": "Call functions/tools"},
    {"bit_position": 1, "name": "can_generate_code", "description": "Generate executable code"},
    {"bit_position": 2, "name": "db_read", "description": "Read database"},
    {"bit_position": 3, "name": "db_write", "description": "Write to database"},
    {"bit_position": 4, "name": "can_send_email", "description": "Send emails"},
    {"bit_position": 5, "name": "can_access_pii", "description": "Access personal data"},
    {"bit_position": 6, "name": "can_manage_users", "description": "Manage users"},
    {"bit_position": 7, "name": "can_configure_system", "description": "Modify configuration"},
]


def build_mask(*caps: int) -> int:
    """Build a bitmask from capability bits."""
    result = 0
    for cap in caps:
        result |= 1 << int(cap)
    return result


def has_capability(mask: int, cap: int) -> bool:
    """Check whether a mask grants a capability bit."""
    return (mask & (1 << int(cap))) != 0


def has_all(mask: int, caps: Iterable[int]) -> bool:
    return all(has_capability(mask, c) for c in caps)


def has_any(mask: int, caps: Iterable[int]) -> bool:
    return any(has_capability(mask, c) for c in caps)


def merge_masks(masks: Iterable[int]) -> int:
    """OR-aggregate multiple masks (e.g. role masks of a user)."""
    return reduce(lambda a, b: a | b, masks, 0)


def active_bits(mask: int) -> list[int]:
    """Return the list of set bit positions in a mask."""
    return [b for b in range(64) if mask & (1 << b)]


def mask_to_labels(mask: int, capabilities: dict[int, str]) -> list[str]:
    """Map set bits to capability names using {bit: name}."""
    return [capabilities[b] for b in active_bits(mask) if b in capabilities]

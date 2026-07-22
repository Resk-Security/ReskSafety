"""LRU cache for built logits processors, keyed by (policy_id, tokenizer_name).

Invalidated whenever a policy is updated or deleted.
"""

from __future__ import annotations

import threading
import uuid
from collections import OrderedDict
from typing import Any


class _LRUCache:
    def __init__(self, maxsize: int = 32) -> None:
        self._maxsize = maxsize
        self._store: OrderedDict[tuple[uuid.UUID, str], Any] = OrderedDict()
        self._lock = threading.RLock()

    def get(self, policy_id: uuid.UUID, tokenizer_name: str) -> Any | None:
        key = (policy_id, tokenizer_name)
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
                return self._store[key]
            return None

    def set(self, policy_id: uuid.UUID, tokenizer_name: str, value: Any) -> None:
        key = (policy_id, tokenizer_name)
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
            self._store[key] = value
            while len(self._store) > self._maxsize:
                self._store.popitem(last=False)

    def invalidate(self, policy_id: uuid.UUID) -> None:
        with self._lock:
            keys = [k for k in self._store if k[0] == policy_id]
            for k in keys:
                self._store.pop(k, None)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


trie_cache = _LRUCache(maxsize=32)


def invalidate_policy(policy_id: uuid.UUID) -> None:
    trie_cache.invalidate(policy_id)

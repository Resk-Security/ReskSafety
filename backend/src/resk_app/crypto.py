from __future__ import annotations

import base64
import hashlib
import os

from cryptography.fernet import Fernet


_PBKDF2_ITERATIONS = 600_000


def _derive_key(master_key: str, salt: bytes | None = None) -> tuple[bytes, bytes]:
    if not master_key:
        raise ValueError("PROVIDER_ENCRYPTION_KEY is empty — set a strong random key")
    if salt is None:
        salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", master_key.encode(), salt, _PBKDF2_ITERATIONS)
    key = base64.urlsafe_b64encode(dk)
    return key, salt


def encrypt_api_key(plaintext: str, master_key: str) -> str | None:
    if not plaintext:
        return None
    key, salt = _derive_key(master_key)
    f = Fernet(key)
    encrypted = f.encrypt(plaintext.encode()).decode()
    return base64.urlsafe_b64encode(salt + encrypted.encode()).decode()


def decrypt_api_key(ciphertext: str | None, master_key: str) -> str | None:
    if not ciphertext:
        return None
    if not master_key:
        raise ValueError("PROVIDER_ENCRYPTION_KEY is empty — set a strong random key")
    raw = base64.urlsafe_b64decode(ciphertext.encode())
    salt, encrypted = raw[:16], raw[16:]
    key, _ = _derive_key(master_key, salt)
    f = Fernet(key)
    return f.decrypt(encrypted.tobytes() if isinstance(encrypted, memoryview) else encrypted).decode()


def generate_encryption_key() -> str:
    return os.urandom(32).hex()

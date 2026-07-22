"""Shared rate limiter instance."""

from slowapi import Limiter
from slowapi.util import get_remote_address

from resk_app.config import get_settings

limiter = Limiter(key_func=get_remote_address)


def rate_limit():
    """Return a slowapi limit decorator for the firewall, from settings."""
    settings = get_settings()
    return limiter.limit(f"{settings.RATE_LIMIT_PER_MINUTE}/minute")

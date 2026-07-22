"""Error classification for LLM backend errors.

Retryable errors:
- API connection errors
- Timeout errors
- 503 Service Unavailable
- Rate limiting (429)

Non-retryable errors:
- Invalid API Key (401)
- Unsupported model (404)
- Context overflow (413)
"""

from __future__ import annotations

from typing import Any

from resk_app.schemas.security_rules import ErrorClassRule

DEFAULT_RULES = ErrorClassRule()


class RetryableError(Exception):
    def __init__(self, message: str, status_code: int | None = None, retry_after: int | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.retry_after = retry_after


class NonRetryableError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def classify_error(exc: Exception, status_code: int | None = None, rules: ErrorClassRule | None = None) -> Exception:
    r = rules or DEFAULT_RULES

    if isinstance(exc, RetryableError) or isinstance(exc, NonRetryableError):
        return exc

    if isinstance(exc, TimeoutError):
        return RetryableError(str(exc), status_code=408)

    if status_code in r.retryable_codes:
        retry_after = None
        return RetryableError(str(exc), status_code=status_code, retry_after=retry_after)

    if status_code in r.non_retryable_codes:
        return NonRetryableError(str(exc), status_code=status_code)

    conn_errors = ("connection refused", "connection reset", "connection aborted", "timeout", "no route to host")
    msg = str(exc).lower()
    if any(e in msg for e in conn_errors):
        return RetryableError(str(exc))

    if status_code and 500 <= status_code < 600:
        return RetryableError(str(exc), status_code=status_code)

    return NonRetryableError(str(exc), status_code=status_code)

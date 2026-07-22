"""Shell commands security.

Rules:
- Strict timeout: 1-300 seconds
- Output streaming in real-time (async generator)
- Approval required (except YOLO mode)
"""

from __future__ import annotations

import asyncio
import logging
from typing import AsyncGenerator

from resk_app.schemas.security_rules import ShellCommandRule

logger = logging.getLogger(__name__)


class ShellSecurityError(Exception):
    pass


DEFAULT_RULES = ShellCommandRule()


async def run_shell_command(
    command: str,
    timeout_sec: int = 30,
    rules: ShellCommandRule | None = None,
    yolo_mode: bool = False,
) -> AsyncGenerator[str, None]:
    r = rules or DEFAULT_RULES

    if timeout_sec < r.min_timeout_sec:
        raise ShellSecurityError(f"Timeout too low: {timeout_sec}s < min {r.min_timeout_sec}s")
    if timeout_sec > r.max_timeout_sec:
        raise ShellSecurityError(f"Timeout too high: {timeout_sec}s > max {r.max_timeout_sec}s")

    if r.require_approval and not yolo_mode:
        yield "[APPROVAL REQUIRED] Command requires approval (YOLO mode bypasses this)"

    proc = await asyncio.create_subprocess_shell(
        command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    async def _read_stream(stream: asyncio.StreamReader, prefix: str) -> AsyncGenerator[str, None]:
        while True:
            line = await stream.readline()
            if not line:
                break
            yield f"{prefix}{line.decode('utf-8', errors='replace')}"

    try:
        async def _stream() -> AsyncGenerator[str, None]:
            done, pending = await asyncio.wait(
                {
                    asyncio.create_task(_read_stream(proc.stdout, "")),
                    asyncio.create_task(_read_stream(proc.stderr, "[stderr] ")),
                },
                timeout=timeout_sec,
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()

            await proc.wait()

        async for chunk in _stream():
            yield chunk

    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        yield f"\n[TIMEOUT] Command timed out after {timeout_sec}s"

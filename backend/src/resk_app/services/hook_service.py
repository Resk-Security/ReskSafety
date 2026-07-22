"""Hook executor: runs lifecycle hooks at key agent points."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from resk_app.models.hook import Hook

logger = logging.getLogger(__name__)


class HookResult:
    def __init__(
        self,
        hook: Hook,
        allowed: bool = True,
        stdout: str = "",
        stderr: str = "",
        error: str | None = None,
    ):
        self.hook = hook
        self.allowed = allowed
        self.stdout = stdout
        self.stderr = stderr
        self.error = error

    def to_dict(self) -> dict:
        return {
            "hook_id": str(self.hook.id),
            "hook_name": self.hook.name,
            "hook_type": self.hook.hook_type,
            "action": self.hook.action,
            "allowed": self.allowed,
            "stdout": self.stdout[:500],
            "stderr": self.stderr[:500],
            "error": self.error,
        }


async def execute_hook(hook: Hook, context: dict[str, Any] | None = None) -> HookResult:
    """Execute a hook command and return the result."""
    if not hook.is_active:
        return HookResult(hook, allowed=True)

    command = hook.command.strip()
    if not command:
        return HookResult(hook, allowed=True)

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=hook.timeout_sec
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            result = HookResult(hook, allowed=False, error=f"Timeout after {hook.timeout_sec}s")
            logger.warning("Hook %s timed out", hook.name)
            return result

        stdout_str = stdout.decode("utf-8", errors="replace") if stdout else ""
        stderr_str = stderr.decode("utf-8", errors="replace") if stderr else ""

        if proc.returncode != 0:
            if hook.action == "block":
                return HookResult(hook, allowed=False, stdout=stdout_str, stderr=stderr_str, error=f"Exit code {proc.returncode}")
            return HookResult(hook, allowed=True, stdout=stdout_str, stderr=stderr_str)

        return HookResult(hook, allowed=True, stdout=stdout_str, stderr=stderr_str)

    except FileNotFoundError:
        error = f"Command not found: {command.split()[0] if command else ''}"
        logger.error(error)
        return HookResult(hook, allowed=hook.action != "block", error=error)
    except Exception as exc:
        error = str(exc)
        logger.error("Hook %s error: %s", hook.name, error)
        return HookResult(hook, allowed=hook.action != "block", error=error)


async def execute_hooks(
    hooks: list[Hook],
    context: dict[str, Any] | None = None,
) -> list[HookResult]:
    """Execute all hooks and return results. If any returns allowed=False, stop."""
    results: list[HookResult] = []
    for hook in hooks:
        result = await execute_hook(hook, context)
        results.append(result)
        if not result.allowed and hook.action == "block":
            break
    return results

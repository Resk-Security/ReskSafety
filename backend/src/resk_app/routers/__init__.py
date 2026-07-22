"""Routers package."""

from resk_app.routers.admin import router as admin_router
from resk_app.routers.auth import router as auth_router
from resk_app.routers.capabilities import router as capabilities_router
from resk_app.routers.firewall import router as firewall_router
from resk_app.routers.hooks import router as hooks_router
from resk_app.routers.mcp import router as mcp_router
from resk_app.routers.mcp_server import router as mcp_server_router
from resk_app.routers.memory import router as memory_router
from resk_app.routers.models import router as models_router
from resk_app.routers.policies import router as policies_router
from resk_app.routers.policy_configs import router as policy_configs_router
from resk_app.routers.policy_rules import router as policy_rules_router
from resk_app.routers.providers import router as providers_router
from resk_app.routers.roles import router as roles_router
from resk_app.routers.sessions import router as sessions_router
from resk_app.routers.settings import router as settings_router
from resk_app.routers.users import router as users_router

# Deprecated — use-case configs are now per-policy, managed via Policy CRUD.
# from resk_app.routers.use_cases import router as use_cases_router

__all__ = [
    "auth_router",
    "users_router",
    "roles_router",
    "hooks_router",
    "mcp_router",
    "mcp_server_router",
    "memory_router",
    "models_router",
    "policy_configs_router",
    "policies_router",
    "policy_rules_router",
    "capabilities_router",
    "admin_router",
    "firewall_router",
    "providers_router",
    "settings_router",
]

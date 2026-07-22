#!/usr/bin/env python3
"""MCP server for RESK — deployable LLM firewall.

Provides AI agents (Claude, etc.) with tools to configure and interact
with the RESK firewall platform via the Model Context Protocol.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

# ──────────────── Configuration ────────────────

BASE_URL = os.environ.get("RESK_BASE_URL", "http://localhost:8000")
ADMIN_USER = os.environ.get("RESK_ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("RESK_ADMIN_PASS", "changeme")

# ──────────────── API Client ────────────────


class ReskClient:
    """Minimal HTTP client for the RESK backend.

    Handles JWT + CSRF cookie auth automatically.
    """

    def __init__(self, base_url: str) -> None:
        self.base = base_url.rstrip("/")
        self._client = httpx.Client(base_url=self.base, verify=False)
        self._csrf_token: str | None = None
        self._logged_in = False

    def _ensure_auth(self) -> None:
        if not self._logged_in:
            self._login()

    def _login(self) -> None:
        resp = self._client.post(
            "/api/auth/login",
            json={"username": ADMIN_USER, "password": ADMIN_PASS},
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Login failed ({resp.status_code}): {resp.text}")
        data = resp.json()
        csrf = data.get("csrf_token")
        if csrf:
            self._csrf_token = csrf
        self._logged_in = True

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {"Content-Type": "application/json"}
        if self._csrf_token:
            h["X-CSRF-Token"] = self._csrf_token
        return h

    def request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any] | list[Any]:
        self._ensure_auth()
        kwargs.setdefault("headers", self._headers())
        path = path.lstrip("/")
        for attempt in range(2):
            resp = self._client.request(method, f"/{path}", **kwargs)
            if resp.status_code == 401 and attempt == 0:
                self._logged_in = False
                self._ensure_auth()
                kwargs["headers"] = self._headers()
                continue
            if resp.status_code == 204:
                return {"ok": True}
            if resp.status_code >= 400:
                raise RuntimeError(f"API error {resp.status_code} for {method} {path}: {resp.text}")
            return resp.json()
        raise RuntimeError(f"Failed after retry for {method} {path}")

    def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return self.request("GET", path, params=params)

    def post(self, path: str, json_body: dict[str, Any] | None = None) -> Any:
        return self.request("POST", path, json=json_body or {})

    def put(self, path: str, json_body: dict[str, Any] | None = None) -> Any:
        return self.request("PUT", path, json=json_body or {})

    def delete(self, path: str) -> Any:
        return self.request("DELETE", path)

    def upload(self, path: str, files: dict[str, Any]) -> Any:
        self._ensure_auth()
        h = self._headers().copy()
        h.pop("Content-Type", None)
        resp = self._client.post(path.lstrip("/"), files=files, headers=h)
        if resp.status_code >= 400:
            raise RuntimeError(f"Upload error {resp.status_code}: {resp.text}")
        return resp.json()


# ──────────────── Tool helpers ────────────────


def tool(name: str, description: str, input_schema: dict[str, Any]) -> Tool:
    return Tool(name=name, description=description, inputSchema=input_schema)


def text(msg: Any) -> list[TextContent]:
    return [TextContent(type="text", text=json.dumps(msg, indent=2, default=str))]


def optional(obj: dict[str, Any]) -> dict[str, Any]:
    """Mark all fields as optional."""
    return {k: v for k, v in obj.items()}


# ──────────────── Server ────────────────

server = Server("resk-mcp")
client = ReskClient(BASE_URL)


# ======================== 1. AUTH ========================

@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        # ── Auth ──
        tool("auth_login", "Authenticate as admin (manual re-login if session expired)",
             {"type": "object", "properties": {"username": {"type": "string"}, "password": {"type": "string"}}}),
        tool("auth_me", "Get current admin user info", {"type": "object", "properties": {}}),

        # ── Users ──
        tool("users_list", "List all users with session counts",
             {"type": "object", "properties": {}}),
        tool("users_create", "Create a new user",
             {"type": "object", "properties": {
                 "username": {"type": "string"}, "email": {"type": "string"},
                 "password": {"type": "string"}, "is_active": {"type": "boolean"},
                 "is_admin": {"type": "boolean"}, "role_ids": {"type": "array", "items": {"type": "string"}}}}),
        tool("users_get", "Get a single user by ID",
             {"type": "object", "properties": {"user_id": {"type": "string"}}, "required": ["user_id"]}),
        tool("users_get_mask", "Get computed capabilities mask for a user",
             {"type": "object", "properties": {"user_id": {"type": "string"}}, "required": ["user_id"]}),
        tool("users_update", "Update a user (partial fields)",
             {"type": "object", "properties": {
                 "user_id": {"type": "string"}, "username": {"type": "string"},
                 "email": {"type": "string"}, "password": {"type": "string"},
                 "is_active": {"type": "boolean"}, "is_admin": {"type": "boolean"},
                 "role_ids": {"type": "array", "items": {"type": "string"}}},
             "required": ["user_id"]}),
        tool("users_delete", "Delete a user",
             {"type": "object", "properties": {"user_id": {"type": "string"}}, "required": ["user_id"]}),

        # ── Roles ──
        tool("roles_list", "List all roles",
             {"type": "object", "properties": {}}),
        tool("roles_create", "Create a new role with capabilities mask and policy attachments",
             {"type": "object", "properties": {
                 "name": {"type": "string"}, "description": {"type": "string"},
                 "capabilities_mask": {"type": "integer"},
                 "policy_ids": {"type": "array", "items": {"type": "string"}}},
             "required": ["name"]}),
        tool("roles_update", "Update a role",
             {"type": "object", "properties": {
                 "role_id": {"type": "string"}, "name": {"type": "string"},
                 "description": {"type": "string"}, "capabilities_mask": {"type": "integer"},
                 "policy_ids": {"type": "array", "items": {"type": "string"}}},
             "required": ["role_id"]}),
        tool("roles_delete", "Delete a role",
             {"type": "object", "properties": {"role_id": {"type": "string"}}, "required": ["role_id"]}),
        tool("roles_attach_policy", "Attach a policy to a role",
             {"type": "object", "properties": {
                 "role_id": {"type": "string"}, "policy_id": {"type": "string"}},
             "required": ["role_id", "policy_id"]}),

        # ── Capabilities ──
        tool("capabilities_list", "List all capability bit definitions",
             {"type": "object", "properties": {}}),
        tool("capabilities_create", "Create a new capability at a bit position (0-63)",
             {"type": "object", "properties": {
                 "bit_position": {"type": "integer"}, "name": {"type": "string"},
                 "description": {"type": "string"}},
             "required": ["bit_position", "name"]}),
        tool("capabilities_update", "Update a capability name/description",
             {"type": "object", "properties": {
                 "bit_position": {"type": "integer"}, "name": {"type": "string"},
                 "description": {"type": "string"}},
             "required": ["bit_position"]}),
        tool("capabilities_delete", "Delete a capability by bit position",
             {"type": "object", "properties": {"bit_position": {"type": "integer"}},
             "required": ["bit_position"]}),

        # ── Providers ──
        tool("providers_list", "List all LLM providers",
             {"type": "object", "properties": {}}),
        tool("providers_get", "Get a single provider",
             {"type": "object", "properties": {"provider_id": {"type": "string"}},
             "required": ["provider_id"]}),
        tool("providers_create", "Create a new LLM provider",
             {"type": "object", "properties": {
                 "name": {"type": "string"}, "provider_type": {"type": "string"},
                 "endpoint": {"type": "string"}, "api_key": {"type": "string"},
                 "default_model": {"type": "string"},
                 "is_active": {"type": "boolean"}},
             "required": ["name", "endpoint"]}),
        tool("providers_update", "Update a provider",
             {"type": "object", "properties": {
                 "provider_id": {"type": "string"}, "name": {"type": "string"},
                 "provider_type": {"type": "string"}, "endpoint": {"type": "string"},
                 "api_key": {"type": "string"}, "default_model": {"type": "string"},
                 "is_active": {"type": "boolean"}},
             "required": ["provider_id"]}),
        tool("providers_delete", "Delete a provider",
             {"type": "object", "properties": {"provider_id": {"type": "string"}},
             "required": ["provider_id"]}),
        tool("providers_test", "Test provider connectivity",
             {"type": "object", "properties": {"provider_id": {"type": "string"}},
             "required": ["provider_id"]}),

        # ── Policies ──
        tool("policies_list", "List all security policies",
             {"type": "object", "properties": {}}),
        tool("policies_get", "Get a single policy with all configs and rules",
             {"type": "object", "properties": {"policy_id": {"type": "string"}},
             "required": ["policy_id"]}),
        tool("policies_create", "Create a new security policy with rules and optional config references",
             {"type": "object", "properties": {
                 "name": {"type": "string"}, "description": {"type": "string"},
                 "rules": {"type": "array", "items": {"type": "object"}},
                 "semantic_detection_config_id": {"type": "string"},
                 "access_control_config_id": {"type": "string"},
                 "classifiers_config_id": {"type": "string"},
                 "scanning_pipeline_config_id": {"type": "string"}},
             "required": ["name"]}),
        tool("policies_update", "Update a policy (partial — only provided fields change)",
             {"type": "object", "properties": {
                 "policy_id": {"type": "string"}, "name": {"type": "string"},
                 "description": {"type": "string"},
                 "rules": {"type": "array", "items": {"type": "object"}},
                 "semantic_detection_config_id": {"type": "string"},
                 "access_control_config_id": {"type": "string"},
                 "classifiers_config_id": {"type": "string"},
                 "scanning_pipeline_config_id": {"type": "string"}},
             "required": ["policy_id"]}),
        tool("policies_delete", "Delete a policy",
             {"type": "object", "properties": {"policy_id": {"type": "string"}},
             "required": ["policy_id"]}),
        tool("policies_preview", "Test rules against arbitrary text",
             {"type": "object", "properties": {
                 "text": {"type": "string"},
                 "rules": {"type": "array", "items": {"type": "object",
                     "properties": {"phrases": {"type": "array", "items": {"type": "string"}},
                         "mode": {"type": "string"}, "penalty": {"type": "number"},
                         "rule_type": {"type": "string"}}}}},
             "required": ["text"]}),
        tool("policies_export_yaml", "Export a policy as YAML string",
             {"type": "object", "properties": {"policy_id": {"type": "string"}},
             "required": ["policy_id"]}),

        # ── Policy Configs ──
        tool("configs_list", "List all reusable configs (optionally filter by type: semantic_detection|access_control|classifiers|scanning_pipeline)",
             {"type": "object", "properties": {"type": {"type": "string"}}}),
        tool("configs_create", "Create a reusable config",
             {"type": "object", "properties": {
                 "name": {"type": "string"}, "description": {"type": "string"},
                 "config_type": {"type": "string",
                     "enum": ["semantic_detection", "access_control", "classifiers", "scanning_pipeline"]},
                 "config": {"type": "object"}},
             "required": ["name", "config_type", "config"]}),
        tool("configs_get", "Get a single config by ID",
             {"type": "object", "properties": {"config_id": {"type": "string"}},
             "required": ["config_id"]}),
        tool("configs_update", "Update a config",
             {"type": "object", "properties": {
                 "config_id": {"type": "string"}, "name": {"type": "string"},
                 "description": {"type": "string"}, "config": {"type": "object"}},
             "required": ["config_id"]}),
        tool("configs_delete", "Delete a config",
             {"type": "object", "properties": {"config_id": {"type": "string"}},
             "required": ["config_id"]}),

        # ── Policy Rules ──
        tool("rules_list", "List all standalone policy rules",
             {"type": "object", "properties": {}}),
        tool("rules_create", "Create a standalone policy rule",
             {"type": "object", "properties": {
                 "name": {"type": "string"}, "description": {"type": "string"},
                 "rule_type": {"type": "string", "enum": ["exact", "contains", "startswith"]},
                 "phrases": {"type": "array", "items": {"type": "string"}},
                 "mode": {"type": "string", "enum": ["hard", "bias"]},
                 "penalty": {"type": "number"}},
             "required": ["name", "phrases"]}),
        tool("rules_update", "Update a rule",
             {"type": "object", "properties": {
                 "rule_id": {"type": "string"}, "name": {"type": "string"},
                 "description": {"type": "string"}, "rule_type": {"type": "string"},
                 "phrases": {"type": "array", "items": {"type": "string"}},
                 "mode": {"type": "string"}, "penalty": {"type": "number"}},
             "required": ["rule_id"]}),
        tool("rules_delete", "Delete a rule",
             {"type": "object", "properties": {"rule_id": {"type": "string"}},
             "required": ["rule_id"]}),

        # ── Firewall ──
        tool("chat_completions", "Send a chat completion request through the firewall (OpenAI-compatible)",
             {"type": "object", "properties": {
                 "messages": {"type": "array", "items": {"type": "object",
                     "properties": {"role": {"type": "string"}, "content": {"type": "string"}}}},
                 "model": {"type": "string"}, "max_tokens": {"type": "integer"},
                 "temperature": {"type": "number"}},
             "required": ["messages"]}),
        tool("tokenize", "Debug: tokenize text and detect blocked phrases/tokens for current user",
             {"type": "object", "properties": {
                 "text": {"type": "string"}, "model": {"type": "string"}},
             "required": ["text"]}),

        # ── Settings ──
        tool("settings_get", "Get all global engine settings",
             {"type": "object", "properties": {}}),
        tool("settings_update", "Update global engine settings (send the full settings object)",
             {"type": "object", "properties": {"settings": {"type": "object"}},
             "required": ["settings"]}),
        tool("tokenizer_detect", "Load a HuggingFace tokenizer for a model and detect its special tokens",
             {"type": "object", "properties": {
                 "model_name": {"type": "string"},
                 "tokenizer_name": {"type": "string"},
                 "trust_remote_code": {"type": "boolean"},
                 "add_prefix_space": {"type": "boolean"},
                 "custom_special_tokens": {"type": "array", "items": {"type": "string"}}},
             "required": ["model_name"]}),

        # ── Admin / Observability ──
        tool("admin_stats", "Get aggregate request statistics",
             {"type": "object", "properties": {}}),
        tool("admin_logs", "List request logs with optional filters",
             {"type": "object", "properties": {
                 "user_id": {"type": "string"}, "status": {"type": "string"},
                 "phrase": {"type": "string"}, "limit": {"type": "integer"},
                 "offset": {"type": "integer"}}}),
        tool("admin_graph", "Get the full knowledge graph (users, sessions, tools, providers, roles, policies)",
             {"type": "object", "properties": {}}),
        tool("admin_changelog", "List audit changelog entries",
             {"type": "object", "properties": {
                 "entity_type": {"type": "string"}, "limit": {"type": "integer"},
                 "offset": {"type": "integer"}}}),
        tool("admin_observability_get", "Get observability/security config",
             {"type": "object", "properties": {}}),
        tool("admin_observability_update", "Update observability/security config",
             {"type": "object", "properties": {"config": {"type": "object"}},
             "required": ["config"]}),
        tool("admin_security_test", "Run a security test on arbitrary text",
             {"type": "object", "properties": {
                 "text": {"type": "string"}, "provider_id": {"type": "string"}},
             "required": ["text"]}),
        tool("admin_health", "Health check",
             {"type": "object", "properties": {}}),

        # ── Sessions ──
        tool("sessions_list", "List agent sessions for a user",
             {"type": "object", "properties": {"user_id": {"type": "string"}},
             "required": ["user_id"]}),
        tool("sessions_tools", "List tool calls for a session",
             {"type": "object", "properties": {"user_id": {"type": "string"}, "session_id": {"type": "string"}},
             "required": ["user_id", "session_id"]}),
        tool("sessions_stats", "Get session statistics for a user",
             {"type": "object", "properties": {"user_id": {"type": "string"}},
             "required": ["user_id"]}),

        # ── Use Cases ──
        tool("use_cases_semantic_detection_get", "Get the semantic detection config",
             {"type": "object", "properties": {}}),
        tool("use_cases_semantic_detection_update", "Update semantic detection config",
             {"type": "object", "properties": {"config": {"type": "object"}},
             "required": ["config"]}),
        tool("use_cases_access_control_get", "Get the access control config (ACL tree)",
             {"type": "object", "properties": {}}),
        tool("use_cases_access_control_update", "Update access control config",
             {"type": "object", "properties": {"config": {"type": "object"}},
             "required": ["config"]}),
        tool("use_cases_classifiers_get", "Get the classifiers config",
             {"type": "object", "properties": {}}),
        tool("use_cases_classifiers_update", "Update classifiers config (rules, shadow penalty, multi-level)",
             {"type": "object", "properties": {"config": {"type": "object"}},
             "required": ["config"]}),
    ]


# ======================== 2. TOOL HANDLERS ========================


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    handler = _HANDLERS.get(name)
    if handler is None:
        raise ValueError(f"Unknown tool: {name}")
    return await handler(arguments)


async def _noop(args: dict[str, Any]) -> list[TextContent]:
    return text({"ok": True, "args": args})


# ── Auth ──

async def _auth_login(args: dict[str, Any]) -> list[TextContent]:
    global client
    client = ReskClient(BASE_URL)
    if args.get("username"):
        os.environ["RESK_ADMIN_USER"] = args["username"]
    if args.get("password"):
        os.environ["RESK_ADMIN_PASS"] = args["password"]
    client._login()
    return text({"ok": True, "message": "Logged in, session active"})

async def _auth_me(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get("/api/auth/me"))


# ── Users ──

async def _users_list(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get("/api/users"))

async def _users_create(args: dict[str, Any]) -> list[TextContent]:
    body = {k: v for k, v in args.items() if v is not None}
    return text(client.post("/api/users", json_body=body))

async def _users_get(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get(f"/api/users/{args['user_id']}"))

async def _users_get_mask(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get(f"/api/users/{args['user_id']}/mask"))

async def _users_update(args: dict[str, Any]) -> list[TextContent]:
    uid = args.pop("user_id")
    body = {k: v for k, v in args.items() if v is not None}
    return text(client.put(f"/api/users/{uid}", json_body=body))

async def _users_delete(args: dict[str, Any]) -> list[TextContent]:
    return text(client.delete(f"/api/users/{args['user_id']}"))


# ── Roles ──

async def _roles_list(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get("/api/roles"))

async def _roles_create(args: dict[str, Any]) -> list[TextContent]:
    body = {k: v for k, v in args.items() if v is not None}
    return text(client.post("/api/roles", json_body=body))

async def _roles_update(args: dict[str, Any]) -> list[TextContent]:
    rid = args.pop("role_id")
    body = {k: v for k, v in args.items() if v is not None}
    return text(client.put(f"/api/roles/{rid}", json_body=body))

async def _roles_delete(args: dict[str, Any]) -> list[TextContent]:
    return text(client.delete(f"/api/roles/{args['role_id']}"))

async def _roles_attach_policy(args: dict[str, Any]) -> list[TextContent]:
    return text(client.post(f"/api/roles/{args['role_id']}/policy?policy_id={args['policy_id']}"))


# ── Capabilities ──

async def _capabilities_list(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get("/api/capabilities"))

async def _capabilities_create(args: dict[str, Any]) -> list[TextContent]:
    body = {k: v for k, v in args.items() if v is not None}
    return text(client.post("/api/capabilities", json_body=body))

async def _capabilities_update(args: dict[str, Any]) -> list[TextContent]:
    bp = args.pop("bit_position")
    body = {k: v for k, v in args.items() if v is not None}
    return text(client.put(f"/api/capabilities/{bp}", json_body=body))

async def _capabilities_delete(args: dict[str, Any]) -> list[TextContent]:
    return text(client.delete(f"/api/capabilities/{args['bit_position']}"))


# ── Providers ──

async def _providers_list(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get("/api/providers"))

async def _providers_get(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get(f"/api/providers/{args['provider_id']}"))

async def _providers_create(args: dict[str, Any]) -> list[TextContent]:
    body = {k: v for k, v in args.items() if v is not None}
    return text(client.post("/api/providers", json_body=body))

async def _providers_update(args: dict[str, Any]) -> list[TextContent]:
    pid = args.pop("provider_id")
    body = {k: v for k, v in args.items() if v is not None}
    return text(client.put(f"/api/providers/{pid}", json_body=body))

async def _providers_delete(args: dict[str, Any]) -> list[TextContent]:
    return text(client.delete(f"/api/providers/{args['provider_id']}"))

async def _providers_test(args: dict[str, Any]) -> list[TextContent]:
    return text(client.post(f"/api/providers/{args['provider_id']}/test"))


# ── Policies ──

async def _policies_list(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get("/api/policies"))

async def _policies_get(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get(f"/api/policies/{args['policy_id']}"))

async def _policies_create(args: dict[str, Any]) -> list[TextContent]:
    body = {k: v for k, v in args.items() if v is not None}
    return text(client.post("/api/policies", json_body=body))

async def _policies_update(args: dict[str, Any]) -> list[TextContent]:
    pid = args.pop("policy_id")
    body = {k: v for k, v in args.items() if v is not None}
    return text(client.put(f"/api/policies/{pid}", json_body=body))

async def _policies_delete(args: dict[str, Any]) -> list[TextContent]:
    return text(client.delete(f"/api/policies/{args['policy_id']}"))

async def _policies_preview(args: dict[str, Any]) -> list[TextContent]:
    return text(client.post("/api/policies/preview", json_body=args))

async def _policies_export(args: dict[str, Any]) -> list[TextContent]:
    client._ensure_auth()
    h = client._headers().copy()
    h.pop("Content-Type", None)
    resp = client._client.get(f"/api/policies/{args['policy_id']}/export", headers=h)
    if resp.status_code >= 400:
        raise RuntimeError(f"Export error: {resp.text}")
    return text({"yaml": resp.text})


# ── Configs ──

async def _configs_list(args: dict[str, Any]) -> list[TextContent]:
    params = {}
    if args.get("type"):
        params["type"] = args["type"]
    return text(client.get("/api/policy-configs", params=params))

async def _configs_create(args: dict[str, Any]) -> list[TextContent]:
    body = {k: v for k, v in args.items() if v is not None}
    return text(client.post("/api/policy-configs", json_body=body))

async def _configs_get(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get(f"/api/policy-configs/{args['config_id']}"))

async def _configs_update(args: dict[str, Any]) -> list[TextContent]:
    cid = args.pop("config_id")
    body = {k: v for k, v in args.items() if v is not None}
    return text(client.put(f"/api/policy-configs/{cid}", json_body=body))

async def _configs_delete(args: dict[str, Any]) -> list[TextContent]:
    return text(client.delete(f"/api/policy-configs/{args['config_id']}"))


# ── Rules ──

async def _rules_list(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get("/api/policy-rules"))

async def _rules_create(args: dict[str, Any]) -> list[TextContent]:
    body = {k: v for k, v in args.items() if v is not None}
    return text(client.post("/api/policy-rules", json_body=body))

async def _rules_update(args: dict[str, Any]) -> list[TextContent]:
    rid = args.pop("rule_id")
    body = {k: v for k, v in args.items() if v is not None}
    return text(client.put(f"/api/policy-rules/{rid}", json_body=body))

async def _rules_delete(args: dict[str, Any]) -> list[TextContent]:
    return text(client.delete(f"/api/policy-rules/{args['rule_id']}"))


# ── Firewall ──

async def _chat_completions(args: dict[str, Any]) -> list[TextContent]:
    return text(client.post("/v1/chat/completions", json_body=args))

async def _tokenize(args: dict[str, Any]) -> list[TextContent]:
    return text(client.post("/v1/tokenize", json_body=args))


# ── Settings ──

async def _settings_get(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get("/api/settings/global"))

async def _settings_update(args: dict[str, Any]) -> list[TextContent]:
    settings = args.get("settings", args)
    return text(client.put("/api/settings/global", json_body=settings))

async def _tokenizer_detect(args: dict[str, Any]) -> list[TextContent]:
    model = args.pop("model_name")
    return text(client.post(f"/api/settings/tokenizer/{model}/detect", json_body=args))


# ── Admin / Observability ──

async def _admin_stats(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get("/api/admin/stats"))

async def _admin_logs(args: dict[str, Any]) -> list[TextContent]:
    params = {k: v for k, v in args.items() if v is not None}
    return text(client.get("/api/admin/logs", params=params))

async def _admin_graph(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get("/api/admin/graph"))

async def _admin_changelog(args: dict[str, Any]) -> list[TextContent]:
    params = {k: v for k, v in args.items() if v is not None}
    return text(client.get("/api/admin/changelog", params=params))

async def _admin_observability_get(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get("/api/admin/observability/config"))

async def _admin_observability_update(args: dict[str, Any]) -> list[TextContent]:
    return text(client.put("/api/admin/observability/config", json_body=args.get("config", args)))

async def _admin_security_test(args: dict[str, Any]) -> list[TextContent]:
    return text(client.post("/api/admin/security/test", json_body=args))

async def _admin_health(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get("/api/admin/health"))


# ── Sessions ──

async def _sessions_list(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get(f"/api/sessions/user/{args['user_id']}"))

async def _sessions_tools(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get(f"/api/sessions/user/{args['user_id']}/tools", params={"session_id": args["session_id"]}))

async def _sessions_stats(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get(f"/api/sessions/user/{args['user_id']}/stats"))


# ── Use Cases ──

async def _use_cases_sd_get(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get("/api/admin/use-cases/semantic-detection"))

async def _use_cases_sd_update(args: dict[str, Any]) -> list[TextContent]:
    return text(client.put("/api/admin/use-cases/semantic-detection", json_body=args.get("config", args)))

async def _use_cases_acl_get(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get("/api/admin/use-cases/access-control"))

async def _use_cases_acl_update(args: dict[str, Any]) -> list[TextContent]:
    return text(client.put("/api/admin/use-cases/access-control", json_body=args.get("config", args)))

async def _use_cases_cf_get(args: dict[str, Any]) -> list[TextContent]:
    return text(client.get("/api/admin/use-cases/classifiers"))

async def _use_cases_cf_update(args: dict[str, Any]) -> list[TextContent]:
    return text(client.put("/api/admin/use-cases/classifiers", json_body=args.get("config", args)))


# ======================== Handlers registry ========================

_HANDLERS: dict[str, Any] = {
    "auth_login": _auth_login,
    "auth_me": _auth_me,
    "users_list": _users_list,
    "users_create": _users_create,
    "users_get": _users_get,
    "users_get_mask": _users_get_mask,
    "users_update": _users_update,
    "users_delete": _users_delete,
    "roles_list": _roles_list,
    "roles_create": _roles_create,
    "roles_update": _roles_update,
    "roles_delete": _roles_delete,
    "roles_attach_policy": _roles_attach_policy,
    "capabilities_list": _capabilities_list,
    "capabilities_create": _capabilities_create,
    "capabilities_update": _capabilities_update,
    "capabilities_delete": _capabilities_delete,
    "providers_list": _providers_list,
    "providers_get": _providers_get,
    "providers_create": _providers_create,
    "providers_update": _providers_update,
    "providers_delete": _providers_delete,
    "providers_test": _providers_test,
    "policies_list": _policies_list,
    "policies_get": _policies_get,
    "policies_create": _policies_create,
    "policies_update": _policies_update,
    "policies_delete": _policies_delete,
    "policies_preview": _policies_preview,
    "policies_export_yaml": _policies_export,
    "configs_list": _configs_list,
    "configs_create": _configs_create,
    "configs_get": _configs_get,
    "configs_update": _configs_update,
    "configs_delete": _configs_delete,
    "rules_list": _rules_list,
    "rules_create": _rules_create,
    "rules_update": _rules_update,
    "rules_delete": _rules_delete,
    "chat_completions": _chat_completions,
    "tokenize": _tokenize,
    "settings_get": _settings_get,
    "settings_update": _settings_update,
    "tokenizer_detect": _tokenizer_detect,
    "admin_stats": _admin_stats,
    "admin_logs": _admin_logs,
    "admin_graph": _admin_graph,
    "admin_changelog": _admin_changelog,
    "admin_observability_get": _admin_observability_get,
    "admin_observability_update": _admin_observability_update,
    "admin_security_test": _admin_security_test,
    "admin_health": _admin_health,
    "sessions_list": _sessions_list,
    "sessions_tools": _sessions_tools,
    "sessions_stats": _sessions_stats,
    "use_cases_semantic_detection_get": _use_cases_sd_get,
    "use_cases_semantic_detection_update": _use_cases_sd_update,
    "use_cases_access_control_get": _use_cases_acl_get,
    "use_cases_access_control_update": _use_cases_acl_update,
    "use_cases_classifiers_get": _use_cases_cf_get,
    "use_cases_classifiers_update": _use_cases_cf_update,
}


# ======================== Main entry point ========================


async def main() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())

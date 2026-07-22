"""Integration tests for new endpoints: Anthropic /v1/messages,
OpenAI /v1/models, user token login, session stats, MCP server."""

from __future__ import annotations

import json
import uuid
from unittest.mock import ANY, AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


class TestUserLogin:
    """POST /api/auth/user-login — non-admin token generation."""

    def test_user_login_success(self, client, seeded_non_admin_user):
        resp = client.post("/api/auth/user-login", json={
            "username": "testuser",
            "password": "userpass",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] > 0

    def test_user_login_wrong_password(self, client, seeded_non_admin_user):
        resp = client.post("/api/auth/user-login", json={
            "username": "testuser",
            "password": "wrongpass",
        })
        assert resp.status_code == 401
        assert "Invalid credentials" in resp.text

    def test_user_login_disabled_user(self, client, db_session):
        from resk_app.models.user import User
        from resk_app.auth.passwords import hash_password
        from resk_app.rbac import build_mask
        uid = uuid.uuid4()
        user = User(id=uid, username="disableduser", email="disabled@ex.com",
                     hashed_password=hash_password("pass"), is_active=False,
                     is_admin=False)
        db_session.add(user)
        db_session.commit()

        resp = client.post("/api/auth/user-login", json={
            "username": "disableduser",
            "password": "pass",
        })
        assert resp.status_code == 403
        assert "disabled" in resp.text.lower()

    def test_user_login_sets_cookie(self, client, seeded_non_admin_user):
        resp = client.post("/api/auth/user-login", json={
            "username": "testuser",
            "password": "userpass",
        })
        assert resp.status_code == 200
        assert "user_token" in resp.cookies


class TestModelsPublic:
    """GET /v1/models — OpenAI-compatible model listing."""

    def test_list_models_empty(self, client, user_auth_headers):
        resp = client.get("/v1/models", headers=user_auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["object"] == "list"
        assert isinstance(data["data"], list)

    def test_list_models_with_seeded(self, client, db_session, user_auth_headers):
        from resk_app.models.provider import Provider
        from resk_app.models.model import Model

        prov = Provider(
            name="test-provider",
            endpoint="https://api.test.com/v1",
        )
        db_session.add(prov)
        db_session.flush()

        m1 = Model(provider_id=prov.id, name="gpt-4", is_active=True)
        m2 = Model(provider_id=prov.id, name="gpt-3.5", is_active=True)
        db_session.add_all([m1, m2])
        db_session.commit()

        resp = client.get("/v1/models", headers=user_auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["data"]) >= 2
        found = {m["id"] for m in data["data"]}
        assert "gpt-4" in found
        assert "gpt-3.5" in found


class TestAnthropicMessages:
    """POST /v1/messages — Anthropic Messages API format."""

    @patch("resk_app.routers.firewall.call_anthropic_messages", new_callable=AsyncMock)
    def test_messages_non_streaming(self, mock_call, client, user_auth_headers):
        mock_call.return_value = {
            "id": "msg_abc123",
            "type": "message",
            "role": "assistant",
            "content": [{"type": "text", "text": "Hello from Claude!"}],
            "model": "claude-sonnet-4-20250514",
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 10, "output_tokens": 5},
        }

        resp = client.post("/v1/messages", headers=user_auth_headers, json={
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 100,
            "messages": [{"role": "user", "content": "Say hello"}],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "message"
        assert data["role"] == "assistant"
        assert len(data["content"]) == 1
        assert data["content"][0]["text"] == "Hello from Claude!"
        assert data["usage"]["input_tokens"] == 10

    def test_messages_auth_x_api_key(self, client, db_session):
        from resk_app.config import get_settings
        from resk_app.models.user import User
        from resk_app.auth.passwords import hash_password

        # Seed an admin user for x-api-key resolution
        admin = User(id=uuid.uuid4(), username="xapikeyadmin", email="xapi@ex.com",
                      hashed_password=hash_password("x"), is_active=True, is_admin=True)
        db_session.add(admin)
        db_session.commit()

        settings = get_settings()
        old = settings.ANTHROPIC_API_KEY
        settings.ANTHROPIC_API_KEY = "sk-ant-test123"

        try:
            resp = client.post("/v1/messages", headers={
                "x-api-key": "sk-ant-test123",
                "Content-Type": "application/json",
            }, json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 10,
                "messages": [{"role": "user", "content": "hi"}],
            })
            # Should return 502 (backend error) because no real backend,
            # but auth should pass (not 401)
            assert resp.status_code != 401, "x-api-key auth failed"
        finally:
            settings.ANTHROPIC_API_KEY = old

    def test_messages_no_auth(self, client):
        resp = client.post("/v1/messages", json={
            "model": "claude-sonnet-4-20250514",
            "messages": [{"role": "user", "content": "hi"}],
        })
        assert resp.status_code == 401

    @patch("resk_app.routers.firewall.call_anthropic_messages", new_callable=AsyncMock)
    def test_messages_blocked_by_policy(self, mock_call, client, db_session):
        """User with a policy that blocks 'test' should get blocked=True."""
        from resk_app.models.user import User
        from resk_app.models.role import Role
        from resk_app.models.policy import Policy
        from resk_app.models.policy_rule import PolicyRule
        from resk_app.rbac import build_mask
        from resk_app.auth.passwords import hash_password
        from resk_app.auth.jwt import create_jwt

        rule = PolicyRule(name="block-test", phrases=["test"], mode="hard")
        db_session.add(rule)
        db_session.flush()
        policy = Policy(name="block-policy")
        policy.rules = [rule]
        db_session.add(policy)
        db_session.flush()
        role = Role(name="block-role", capabilities_mask=build_mask(0, 1, 2, 3))
        role.policies = [policy]
        db_session.add(role)
        db_session.flush()
        uid = uuid.uuid4()
        user = User(id=uid, username="blockuser", email="bu@ex.com",
                     hashed_password=hash_password("pass"), is_active=True,
                     is_admin=False, roles=[role])
        db_session.add(user)
        db_session.commit()

        token, _ = create_jwt(uid, "blockuser", False, build_mask(0, 1, 2, 3), token_type="user")
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        mock_call.return_value = {
            "id": "msg_blocked",
            "type": "message",
            "role": "assistant",
            "content": [{"type": "text", "text": "this contains test word"}],
            "model": "claude-sonnet-4-20250514",
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 5, "output_tokens": 5},
        }

        resp = client.post("/v1/messages", headers=headers, json={
            "model": "claude-sonnet-4-20250514",
            "messages": [{"role": "user", "content": "say something"}],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["blocked"] is True
        assert data["blocked_phrase"] is not None

    @patch("resk_app.routers.firewall.call_anthropic_messages_stream")
    @patch("resk_app.routers.firewall.call_anthropic_messages", new_callable=AsyncMock)
    def test_messages_system_prompt(self, mock_call, mock_stream, client, user_auth_headers):
        mock_call.return_value = {
            "id": "msg_sys", "type": "message", "role": "assistant",
            "content": [{"type": "text", "text": "OK"}],
            "model": "claude-sonnet-4-20250514", "stop_reason": "end_turn",
            "usage": {"input_tokens": 20, "output_tokens": 2},
        }
        resp = client.post("/v1/messages", headers=user_auth_headers, json={
            "model": "claude-sonnet-4-20250514",
            "system": "You are a helpful AI.",
            "messages": [{"role": "user", "content": "hi"}],
        })
        assert resp.status_code == 200


class TestSessionStats:
    """GET /api/sessions/me/stats — current user session stats."""

    def test_my_stats(self, client, user_auth_headers, seeded_non_admin_user):
        resp = client.get("/api/sessions/me/stats", headers=user_auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["user_id"] == seeded_non_admin_user["id"]
        assert data["username"] == "testuser"

    def test_my_stats_requires_auth(self, client):
        resp = client.get("/api/sessions/me/stats")
        assert resp.status_code == 401


class TestMcpServer:
    """MCP Server — SSE transport + JSON-RPC tools."""

    def test_mcp_post_message(self, client, db_session):
        """POST /mcp/{session_id} with a valid JSON-RPC request."""
        from resk_app.services.mcp_server_service import create_session, wait_for_response

        session_id = create_session()

        resp = client.post(f"/mcp/{session_id}", json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "health",
            "params": {},
        })
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_mcp_tools_list(self, client, db_session):
        from resk_app.services.mcp_server_service import create_session, wait_for_response

        session_id = create_session()

        resp = client.post(f"/mcp/{session_id}", json={
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {},
        })
        assert resp.status_code == 200

    def test_mcp_health_tool(self, client, db_session):
        from resk_app.services.mcp_server_service import create_session, wait_for_response

        session_id = create_session()

        resp = client.post(f"/mcp/{session_id}", json={
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "health",
                "arguments": {},
            },
        })
        assert resp.status_code == 200

    def test_mcp_scan_prompt_tool(self, client, db_session):
        from resk_app.services.mcp_server_service import create_session

        session_id = create_session()

        resp = client.post(f"/mcp/{session_id}", json={
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "scan_prompt",
                "arguments": {"text": "hello world"},
            },
        })
        assert resp.status_code == 200

    def test_mcp_unknown_method(self, client, db_session):
        from resk_app.services.mcp_server_service import create_session

        session_id = create_session()

        resp = client.post(f"/mcp/{session_id}", json={
            "jsonrpc": "2.0",
            "id": 5,
            "method": "nonexistent",
            "params": {},
        })
        assert resp.status_code == 200  # POST always returns 200; errors in SSE

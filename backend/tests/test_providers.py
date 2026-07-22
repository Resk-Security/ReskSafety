"""Phase 5: LLM Providers tests."""

from __future__ import annotations

import uuid

import pytest


class TestProviderCRUD:
    def test_list_providers_empty(self, client, admin_auth_headers):
        resp = client.get("/api/providers", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_provider(self, client, admin_auth_headers):
        resp = client.post("/api/providers", headers=admin_auth_headers, json={
            "name": "test-openai",
            "provider_type": "openai",
            "endpoint": "https://api.openai.com/v1",
            "api_key": "sk-test-key-12345",
            "models": ["gpt-4", "gpt-4o-mini"],
            "default_model": "gpt-4o-mini",
            "stream_supported": True,
            "is_active": True,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "test-openai"
        assert data["provider_type"] == "openai"
        # API key should NOT be returned in plaintext
        assert data.get("api_key") is None or data["api_key"] != "sk-test-key-12345"

    def test_get_provider(self, client, admin_auth_headers):
        resp = client.post("/api/providers", headers=admin_auth_headers, json={
            "name": "get-test-provider",
            "provider_type": "openai",
            "endpoint": "https://api.openai.com/v1",
            "api_key": "sk-key-for-get-test",
            "models": ["gpt-4"],
        })
        pid = resp.json()["id"]
        resp = client.get(f"/api/providers/{pid}", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "get-test-provider"

    def test_update_provider(self, client, admin_auth_headers):
        resp = client.post("/api/providers", headers=admin_auth_headers, json={
            "name": "update-test-provider",
            "provider_type": "openai",
            "endpoint": "https://api.openai.com/v1",
            "api_key": "sk-key-update",
            "models": ["gpt-4"],
        })
        pid = resp.json()["id"]
        resp = client.put(f"/api/providers/{pid}", headers=admin_auth_headers, json={
            "endpoint": "https://custom-endpoint.com/v1",
            "is_active": False,
        })
        assert resp.status_code == 200
        assert resp.json()["endpoint"] == "https://custom-endpoint.com/v1"
        assert resp.json()["is_active"] is False

    def test_delete_provider(self, client, admin_auth_headers):
        resp = client.post("/api/providers", headers=admin_auth_headers, json={
            "name": "delete-test-provider",
            "provider_type": "openai",
            "endpoint": "https://api.openai.com/v1",
            "api_key": "sk-delete",
            "models": ["gpt-4"],
        })
        pid = resp.json()["id"]
        resp = client.delete(f"/api/providers/{pid}", headers=admin_auth_headers)
        assert resp.status_code == 204

    def test_create_provider_duplicate_name(self, client, admin_auth_headers):
        client.post("/api/providers", headers=admin_auth_headers, json={
            "name": "dup-provider",
            "provider_type": "openai",
            "endpoint": "https://api.openai.com/v1",
            "api_key": "sk-dup",
            "models": ["gpt-4"],
        })
        resp = client.post("/api/providers", headers=admin_auth_headers, json={
            "name": "dup-provider",
            "provider_type": "openai",
            "endpoint": "https://api.openai.com/v1",
            "api_key": "sk-dup-2",
            "models": ["gpt-4"],
        })
        assert resp.status_code == 409

    def test_provider_api_key_encrypted(self, client, admin_auth_headers, db_session):
        """Verify that the API key is stored encrypted in the database."""
        from resk_app.models.provider import Provider
        resp = client.post("/api/providers", headers=admin_auth_headers, json={
            "name": "encryption-test",
            "provider_type": "openai",
            "endpoint": "https://api.openai.com/v1",
            "api_key": "sk-very-secret-key-12345",
            "models": ["gpt-4"],
        })
        pid = resp.json()["id"]
        provider = db_session.get(Provider, uuid.UUID(pid))
        assert provider is not None
        # The stored api_key_enc should be different from the plaintext
        assert provider.api_key_enc is not None
        assert provider.api_key_enc != "sk-very-secret-key-12345"
        assert provider.api_key_enc != ""
        # The API response should mask the key
        assert "sk-very-secret-key" not in resp.json().get("api_key_enc", "")


class TestProviderConnectivity:
    def test_provider_test_endpoint(self, client, admin_auth_headers):
        resp = client.post("/api/providers", headers=admin_auth_headers, json={
            "name": "connectivity-test",
            "provider_type": "openai",
            "endpoint": "https://api.openai.com/v1",
            "api_key": "sk-test",
            "models": ["gpt-4"],
        })
        pid = resp.json()["id"]
        resp = client.post(
            f"/api/providers/{pid}/test",
            headers=admin_auth_headers,
        )
        # Should either succeed or fail gracefully
        assert resp.status_code in (200, 400, 502)


class TestProviderEdgeCases:
    def test_inactive_provider(self, client, admin_auth_headers):
        """Inactive providers should be skippable."""
        resp = client.post("/api/providers", headers=admin_auth_headers, json={
            "name": "inactive-provider",
            "provider_type": "openai",
            "endpoint": "https://api.openai.com/v1",
            "api_key": "sk-inactive",
            "is_active": False,
            "models": ["gpt-4"],
        })
        assert resp.status_code == 201
        assert resp.json()["is_active"] is False

    def test_provider_with_vllm_type(self, client, admin_auth_headers):
        resp = client.post("/api/providers", headers=admin_auth_headers, json={
            "name": "vllm-provider",
            "provider_type": "vllm",
            "endpoint": "http://localhost:8001/v1",
            "api_key": "",
            "models": ["local-model"],
        })
        assert resp.status_code == 201

    def test_provider_with_ollama_type(self, client, admin_auth_headers):
        resp = client.post("/api/providers", headers=admin_auth_headers, json={
            "name": "ollama-provider",
            "provider_type": "ollama",
            "endpoint": "http://localhost:11434",
            "api_key": "",
            "models": ["llama3"],
        })
        assert resp.status_code == 201

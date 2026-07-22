"""Tests for Phase 2: Model CRUD and sync from provider."""

from __future__ import annotations

import uuid


class TestModelCRUD:
    def test_list_models_empty(self, client, admin_auth_headers):
        resp = client.get("/api/models", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_model(self, client, admin_auth_headers):
        resp = client.post("/api/models", headers=admin_auth_headers, json={
            "name": "gpt-4o",
            "type": "remote",
            "temperature": 0.5,
            "top_k": 40,
            "max_tokens": 4096,
            "context_window": 128000,
            "response_length_limit": 100,
            "is_active": True,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "gpt-4o"
        assert data["temperature"] == 0.5
        assert data["top_k"] == 40
        assert data["context_full_strategy"] == "truncate"

    def test_get_model(self, client, admin_auth_headers):
        resp = client.post("/api/models", headers=admin_auth_headers, json={
            "name": "get-me",
            "type": "local",
        })
        mid = resp.json()["id"]
        resp = client.get(f"/api/models/{mid}", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "get-me"
        assert resp.json()["type"] == "local"

    def test_update_model(self, client, admin_auth_headers):
        resp = client.post("/api/models", headers=admin_auth_headers, json={
            "name": "update-me", "type": "remote",
        })
        mid = resp.json()["id"]
        resp = client.put(f"/api/models/{mid}", headers=admin_auth_headers, json={
            "temperature": 0.9,
            "context_full_strategy": "summarize",
        })
        assert resp.status_code == 200
        assert resp.json()["temperature"] == 0.9
        assert resp.json()["context_full_strategy"] == "summarize"

    def test_delete_model(self, client, admin_auth_headers):
        resp = client.post("/api/models", headers=admin_auth_headers, json={
            "name": "delete-me", "type": "remote",
        })
        mid = resp.json()["id"]
        resp = client.delete(f"/api/models/{mid}", headers=admin_auth_headers)
        assert resp.status_code == 204

    def test_create_duplicate_name(self, client, admin_auth_headers):
        client.post("/api/models", headers=admin_auth_headers, json={
            "name": "dup-model", "type": "remote",
        })
        resp = client.post("/api/models", headers=admin_auth_headers, json={
            "name": "dup-model", "type": "remote",
        })
        assert resp.status_code == 409

    def test_model_sync_from_provider(self, client, admin_auth_headers, db_session):
        """Creating a provider with models should auto-create Model entries."""
        resp = client.post("/api/providers", headers=admin_auth_headers, json={
            "name": "sync-test-provider",
            "endpoint": "https://api.test.com/v1",
            "models": ["model-a", "model-b"],
            "default_model": "model-a",
        })
        assert resp.status_code == 201
        pid = resp.json()["id"]

        resp = client.get(f"/api/providers/{pid}/models", headers=admin_auth_headers)
        assert resp.status_code == 200
        names = [m["name"] for m in resp.json()]
        assert "model-a" in names
        assert "model-b" in names


class TestModelSecurity:
    def test_model_security_empty(self, client, admin_auth_headers):
        resp = client.post("/api/models", headers=admin_auth_headers, json={
            "name": "sec-model", "type": "remote",
        })
        mid = resp.json()["id"]
        resp = client.get(f"/api/models/{mid}/security", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert resp.json()["policies"] == []

    def test_attach_policy_to_model(self, client, admin_auth_headers, seeded_policy):
        resp = client.post("/api/models", headers=admin_auth_headers, json={
            "name": "attach-model", "type": "remote",
        })
        mid = resp.json()["id"]
        pid = seeded_policy["id"]
        resp = client.post(
            f"/api/models/{mid}/security/policies",
            headers=admin_auth_headers,
            json={"policy_id": pid},
        )
        assert resp.status_code == 201

        resp = client.get(f"/api/models/{mid}/security", headers=admin_auth_headers)
        assert len(resp.json()["policies"]) == 1

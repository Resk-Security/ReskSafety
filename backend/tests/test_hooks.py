"""Tests for Phase 4: Lifecycle Hooks CRUD and execution."""

from __future__ import annotations


class TestHookCRUD:
    def test_list_hooks_empty(self, client, admin_auth_headers):
        resp = client.get("/api/hooks", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_hook(self, client, admin_auth_headers):
        resp = client.post("/api/hooks", headers=admin_auth_headers, json={
            "name": "block-rm-rf",
            "hook_type": "before_tool",
            "command": "echo 'checking...' && exit 0",
            "timeout_sec": 10,
            "action": "block",
            "is_active": True,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "block-rm-rf"
        assert data["hook_type"] == "before_tool"

    def test_get_hook(self, client, admin_auth_headers):
        resp = client.post("/api/hooks", headers=admin_auth_headers, json={
            "name": "get-me-hook",
            "command": "echo hello",
        })
        hid = resp.json()["id"]
        resp = client.get(f"/api/hooks/{hid}", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "get-me-hook"

    def test_update_hook(self, client, admin_auth_headers):
        resp = client.post("/api/hooks", headers=admin_auth_headers, json={
            "name": "update-hook",
            "command": "echo old",
        })
        hid = resp.json()["id"]
        resp = client.put(f"/api/hooks/{hid}", headers=admin_auth_headers, json={
            "command": "echo new",
            "action": "audit",
        })
        assert resp.status_code == 200
        assert resp.json()["command"] == "echo new"
        assert resp.json()["action"] == "audit"

    def test_delete_hook(self, client, admin_auth_headers):
        resp = client.post("/api/hooks", headers=admin_auth_headers, json={
            "name": "delete-hook",
            "command": "echo delete",
        })
        hid = resp.json()["id"]
        resp = client.delete(f"/api/hooks/{hid}", headers=admin_auth_headers)
        assert resp.status_code == 204

    def test_test_hook_success(self, client, admin_auth_headers):
        resp = client.post("/api/hooks", headers=admin_auth_headers, json={
            "name": "test-exec",
            "command": "echo ok",
            "timeout_sec": 5,
        })
        hid = resp.json()["id"]
        import time
        time.sleep(0.1)
        resp = client.post(f"/api/hooks/{hid}/test", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert resp.json()["allowed"] is True

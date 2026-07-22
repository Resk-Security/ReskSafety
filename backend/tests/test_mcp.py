"""Tests for Phase 5: MCP server CRUD and proxy."""

from __future__ import annotations


class TestMcpCRUD:
    def test_list_servers_empty(self, client, admin_auth_headers):
        resp = client.get("/api/mcp/servers", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_server(self, client, admin_auth_headers):
        resp = client.post("/api/mcp/servers", headers=admin_auth_headers, json={
            "name": "my-mcp-server",
            "endpoint": "http://localhost:9999",
            "auth_type": "none",
            "trust_level": "sandboxed",
            "allowed_tools": ["read_file", "search"],
            "is_active": True,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "my-mcp-server"
        assert data["trust_level"] == "sandboxed"
        assert data["allowed_tools"] == ["read_file", "search"]

    def test_get_server(self, client, admin_auth_headers):
        resp = client.post("/api/mcp/servers", headers=admin_auth_headers, json={
            "name": "get-server",
            "endpoint": "http://localhost:9998",
        })
        sid = resp.json()["id"]
        resp = client.get(f"/api/mcp/servers/{sid}", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "get-server"

    def test_update_server(self, client, admin_auth_headers):
        resp = client.post("/api/mcp/servers", headers=admin_auth_headers, json={
            "name": "update-server",
            "endpoint": "http://localhost:9997",
            "trust_level": "sandboxed",
        })
        sid = resp.json()["id"]
        resp = client.put(f"/api/mcp/servers/{sid}", headers=admin_auth_headers, json={
            "trust_level": "trusted",
            "allowed_tools": ["read"],
        })
        assert resp.status_code == 200
        assert resp.json()["trust_level"] == "trusted"

    def test_delete_server(self, client, admin_auth_headers):
        resp = client.post("/api/mcp/servers", headers=admin_auth_headers, json={
            "name": "delete-server",
            "endpoint": "http://localhost:9996",
        })
        sid = resp.json()["id"]
        resp = client.delete(f"/api/mcp/servers/{sid}", headers=admin_auth_headers)
        assert resp.status_code == 204

    def test_test_connection(self, client, admin_auth_headers):
        resp = client.post("/api/mcp/servers", headers=admin_auth_headers, json={
            "name": "connect-test",
            "endpoint": "http://localhost:1",
        })
        sid = resp.json()["id"]
        resp = client.post(f"/api/mcp/servers/{sid}/test", headers=admin_auth_headers)
        # Should fail gracefully since nothing is listening on port 1
        assert resp.status_code == 200
        assert resp.json()["success"] is False

    def test_call_tool_on_inactive(self, client, admin_auth_headers):
        resp = client.post("/api/mcp/servers", headers=admin_auth_headers, json={
            "name": "tool-test",
            "endpoint": "http://localhost:9995",
            "is_active": False,
        })
        sid = resp.json()["id"]
        resp = client.post(
            f"/api/mcp/servers/{sid}/call/my_tool",
            headers=admin_auth_headers,
            json={"tool": "my_tool", "params": {}},
        )
        assert resp.status_code == 200
        assert resp.json()["success"] is False
        assert "inactive" in resp.json()["error"].lower()

    def test_unauthorized_access(self, client):
        resp = client.get("/api/mcp/servers")
        assert resp.status_code == 401 or resp.status_code == 403

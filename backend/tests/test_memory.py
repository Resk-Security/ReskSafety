"""Tests for Phase 3: Memory CRUD, context, summarization."""

from __future__ import annotations


class TestMemoryCRUD:
    SESSION_ID = "test-session-001"

    def test_list_memory_empty(self, client, admin_auth_headers):
        resp = client.get(
            f"/api/sessions/{self.SESSION_ID}/memory",
            headers=admin_auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json() == []

    def test_add_memory_entry(self, client, admin_auth_headers):
        resp = client.post(
            f"/api/sessions/{self.SESSION_ID}/memory",
            headers=admin_auth_headers,
            json={
                "session_id": self.SESSION_ID,
                "role": "user",
                "content": "Hello, what is AI?",
                "turn_number": 0,
                "priority": 1,
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["content"] == "Hello, what is AI?"
        assert data["turn_number"] == 0

    def test_add_and_list_memory(self, client, admin_auth_headers):
        for i, text in enumerate(["Turn A", "Turn B"]):
            client.post(
                f"/api/sessions/{self.SESSION_ID}/memory",
                headers=admin_auth_headers,
                json={"session_id": self.SESSION_ID, "role": "user", "content": text, "turn_number": i},
            )
        resp = client.get(
            f"/api/sessions/{self.SESSION_ID}/memory",
            headers=admin_auth_headers,
        )
        assert len(resp.json()) == 2

    def test_update_memory_entry(self, client, admin_auth_headers):
        resp = client.post(
            f"/api/sessions/{self.SESSION_ID}/memory",
            headers=admin_auth_headers,
            json={"session_id": self.SESSION_ID, "role": "user", "content": "Original", "turn_number": 10},
        )
        eid = resp.json()["id"]
        resp = client.put(
            f"/api/sessions/{self.SESSION_ID}/memory/{eid}",
            headers=admin_auth_headers,
            json={"content": "Updated", "priority": 5},
        )
        assert resp.status_code == 200
        assert resp.json()["content"] == "Updated"
        assert resp.json()["priority"] == 5

    def test_delete_memory_entry(self, client, admin_auth_headers):
        resp = client.post(
            f"/api/sessions/{self.SESSION_ID}/memory",
            headers=admin_auth_headers,
            json={"session_id": self.SESSION_ID, "role": "user", "content": "To delete", "turn_number": 20},
        )
        eid = resp.json()["id"]
        resp = client.delete(
            f"/api/sessions/{self.SESSION_ID}/memory/{eid}",
            headers=admin_auth_headers,
        )
        assert resp.status_code == 204


class TestMemorySummarize:
    def test_summarize(self, client, admin_auth_headers):
        sid = "summarize-session"
        for i in range(10):
            client.post(
                f"/api/sessions/{sid}/memory",
                headers=admin_auth_headers,
                json={"session_id": sid, "role": "user", "content": f"Turn {i}", "turn_number": i},
            )
        resp = client.post(
            f"/api/sessions/{sid}/memory/summarize",
            headers=admin_auth_headers,
            json={"session_id": sid, "max_tokens": 2000},
        )
        assert resp.status_code == 200
        # At least 5 oldest turns should be summarized (10 total, keep_last=5)
        assert resp.json()["summarized"] >= 5


class TestMemoryContext:
    def test_get_context(self, client, admin_auth_headers):
        sid = "context-session"
        client.post(
            f"/api/sessions/{sid}/memory",
            headers=admin_auth_headers,
            json={"session_id": sid, "role": "user", "content": "Context line 1", "turn_number": 0},
        )
        client.post(
            f"/api/sessions/{sid}/memory",
            headers=admin_auth_headers,
            json={"session_id": sid, "role": "assistant", "content": "Context line 2", "turn_number": 1},
        )
        resp = client.get(
            f"/api/sessions/{sid}/memory/context",
            headers=admin_auth_headers,
            params={"max_tokens": 500, "strategy": "truncate"},
        )
        assert resp.status_code == 200
        assert "Context line 1" in resp.json()["context"]
        assert "Context line 2" in resp.json()["context"]

"""Phase 7: Admin & Monitoring tests."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest


class TestAdminStats:
    def test_stats_empty(self, client, admin_auth_headers):
        resp = client.get("/api/admin/stats", headers=admin_auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_requests"] == 0
        assert data["blocked_requests"] == 0
        assert data["success_requests"] == 0
        assert data["error_requests"] == 0
        assert data["blocked_ratio"] == 0.0

    def test_stats_after_logs(self, client, admin_auth_headers, db_session, seeded_policy):
        from resk_app.models.log import RequestLog
        log = RequestLog(
            user_id=None,
            policy_id=None,
            status="blocked",
            backend_type="openai",
            model="gpt-4",
            blocked_phrase="test",
        )
        db_session.add(log)
        db_session.commit()
        resp = client.get("/api/admin/stats", headers=admin_auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_requests"] >= 1
        assert data["blocked_requests"] >= 1


class TestAdminLogs:
    def test_logs_empty(self, client, admin_auth_headers):
        resp = client.get("/api/admin/logs", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_logs_after_insert(self, client, admin_auth_headers, db_session, seeded_policy):
        from resk_app.models.log import RequestLog
        import uuid
        log = RequestLog(
            user_id=uuid.UUID(seeded_policy["id"]),  # just a valid UUID, FK is nullable
            policy_id=uuid.UUID(seeded_policy["id"]),
            status="success",
            backend_type="openai",
            model="gpt-4",
        )
        db_session.add(log)
        db_session.commit()
        resp = client.get("/api/admin/logs", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_logs_filter_by_status(self, client, admin_auth_headers, db_session):
        from resk_app.models.log import RequestLog
        log = RequestLog(status="blocked", backend_type="openai", model="gpt-4", blocked_phrase="secret")
        db_session.add(log)
        db_session.commit()
        resp = client.get("/api/admin/logs?status=blocked", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert all(r["status"] == "blocked" for r in resp.json())

    def test_logs_filter_by_phrase(self, client, admin_auth_headers, db_session):
        from resk_app.models.log import RequestLog
        log = RequestLog(status="blocked", backend_type="openai", model="gpt-4", blocked_phrase="danger")
        db_session.add(log)
        db_session.commit()
        resp = client.get("/api/admin/logs?phrase=danger", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_logs_pagination(self, client, admin_auth_headers, db_session):
        from resk_app.models.log import RequestLog
        for i in range(5):
            db_session.add(RequestLog(status="success", backend_type="openai", model="gpt-4"))
        db_session.commit()
        resp = client.get("/api/admin/logs?limit=2", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 2


class TestAdminGraph:
    def test_graph_empty(self, client, admin_auth_headers):
        resp = client.get("/api/admin/graph", headers=admin_auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "nodes" in data
        assert "links" in data

    def test_graph_after_seed(self, client, admin_auth_headers, seeded_capabilities, seeded_role):
        resp = client.get("/api/admin/graph", headers=admin_auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        # Should at least have capabilities and role nodes
        assert len(data["nodes"]) >= 9  # 8 caps + 1 role


class TestAdminChangelog:
    def test_changelog_empty(self, client, admin_auth_headers):
        resp = client.get("/api/admin/changelog", headers=admin_auth_headers)
        assert resp.status_code == 200

    def test_changelog_after_actions(self, client, admin_auth_headers, db_session):
        from resk_app.models.changelog import ChangeLog
        entry = ChangeLog(
            actor="testadmin",
            entity_type="policy",
            entity_id="test-id",
            action="create",
            summary="Created test policy",
        )
        db_session.add(entry)
        db_session.commit()
        resp = client.get("/api/admin/changelog", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


class TestAdminObservability:
    def test_get_observability_config(self, client, admin_auth_headers):
        resp = client.get("/api/admin/observability/config", headers=admin_auth_headers)
        assert resp.status_code == 200

    def test_update_observability_config(self, client, admin_auth_headers):
        resp = client.put("/api/admin/observability/config", headers=admin_auth_headers, json={
            "scanning": {
                "enabled": True,
                "fail_open": False,
                "block_on_first_threat": True,
                "min_confidence_threshold": 0.5,
                "block_score_threshold": 5.0,
            },
            "logits": {
                "enabled": False,
                "device": "cpu",
                "shadow_penalty": -15.0,
            },
            "observability": {
                "enabled": True,
                "environment": "testing",
                "masking": {"enabled": True, "sensitive_fields": ["api_key"]},
                "sampling": {"default_rate": 0.5, "rules": []},
                "buffering": {"max_size": 500, "flush_interval": 2.0},
                "platforms": {
                    "console": {"enabled": True, "format": "json"},
                    "file": {"enabled": False},
                    "webhook": {"enabled": False},
                    "prometheus": {"enabled": False},
                    "datadog": {"enabled": False},
                },
            },
        })
        assert resp.status_code == 200


class TestAdminSecurityTest:
    def test_security_test(self, client, admin_auth_headers):
        resp = client.post("/api/admin/security/test", headers=admin_auth_headers, json={
            "text": "This is a test message",
        })
        assert resp.status_code in (200, 501)


class TestAdminUnauthenticated:
    def test_all_admin_endpoints_require_auth(self, client):
        """Note: /api/admin/health is deliberately unauthenticated."""
        endpoints = [
            ("GET", "/api/admin/stats"),
            ("GET", "/api/admin/logs"),
            ("GET", "/api/admin/graph"),
            ("GET", "/api/admin/changelog"),
            ("GET", "/api/admin/observability/config"),
        ]
        for method, path in endpoints:
            if method == "GET":
                resp = client.get(path)
            else:
                resp = client.post(path, json={})
            assert resp.status_code != 200, f"{method} {path} should be protected"

    def test_admin_health_public(self, client):
        resp = client.get("/api/admin/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

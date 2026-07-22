"""Phase 3: Policies & Rules tests."""

from __future__ import annotations

import uuid

import pytest


class TestPolicyCRUD:
    def test_list_policies_empty(self, client, admin_auth_headers):
        resp = client.get("/api/policies", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_policy(self, client, admin_auth_headers):
        resp = client.post("/api/policies", headers=admin_auth_headers, json={
            "name": "my-policy",
            "description": "A test policy",
            "rules": [
                {
                    "name": "block-secret",
                    "description": "Blocks the word secret",
                    "rule_type": "contains",
                    "phrases": ["secret"],
                    "mode": "hard",
                }
            ],
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "my-policy"
        assert len(data["rules"]) == 1
        assert data["rules"][0]["phrases"] == ["secret"]

    def test_create_policy_duplicate_name(self, client, admin_auth_headers, seeded_policy):
        resp = client.post("/api/policies", headers=admin_auth_headers, json={
            "name": "test-policy",
            "description": "Duplicate name",
        })
        assert resp.status_code == 409

    def test_get_policy(self, client, admin_auth_headers, seeded_policy):
        resp = client.get(f"/api/policies/{seeded_policy['id']}", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "test-policy"

    def test_get_policy_not_found(self, client, admin_auth_headers):
        resp = client.get(f"/api/policies/{uuid.uuid4()}", headers=admin_auth_headers)
        assert resp.status_code == 404

    def test_update_policy(self, client, admin_auth_headers, seeded_policy):
        resp = client.put(f"/api/policies/{seeded_policy['id']}", headers=admin_auth_headers, json={
            "description": "Updated description",
        })
        assert resp.status_code == 200
        assert resp.json()["description"] == "Updated description"

    def test_update_policy_add_rules(self, client, admin_auth_headers, seeded_policy):
        resp = client.put(f"/api/policies/{seeded_policy['id']}", headers=admin_auth_headers, json={
            "rules": [
                {"name": "block-secret", "phrases": ["secret"], "mode": "hard"},
                {"name": "block-admin", "phrases": ["admin"], "mode": "hard"},
            ],
        })
        assert resp.status_code == 200
        assert len(resp.json()["rules"]) == 2

    def test_delete_policy(self, client, admin_auth_headers, seeded_policy):
        resp = client.delete(f"/api/policies/{seeded_policy['id']}", headers=admin_auth_headers)
        assert resp.status_code == 204

    def test_delete_policy_not_found(self, client, admin_auth_headers):
        resp = client.delete(f"/api/policies/{uuid.uuid4()}", headers=admin_auth_headers)
        assert resp.status_code == 404


class TestPolicyRules:
    def test_create_standalone_rule(self, client, admin_auth_headers):
        resp = client.post("/api/policy-rules", headers=admin_auth_headers, json={
            "name": "standalone-rule",
            "description": "Not attached to a policy",
            "rule_type": "contains",
            "phrases": ["danger"],
            "mode": "hard",
        })
        assert resp.status_code == 201
        assert resp.json()["name"] == "standalone-rule"

    def test_list_rules(self, client, admin_auth_headers, seeded_policy):
        resp = client.get("/api/policy-rules", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_update_rule(self, client, admin_auth_headers, seeded_policy):
        rule_id = seeded_policy["rule_ids"][0]
        resp = client.put(f"/api/policy-rules/{rule_id}", headers=admin_auth_headers, json={
            "phrases": ["test", "updated"],
        })
        assert resp.status_code == 200
        assert "updated" in resp.json()["phrases"]

    def test_delete_rule(self, client, admin_auth_headers, seeded_policy):
        rule_id = seeded_policy["rule_ids"][0]
        resp = client.delete(f"/api/policy-rules/{rule_id}", headers=admin_auth_headers)
        assert resp.status_code == 204


class TestPolicyConfigs:
    def test_create_config(self, client, admin_auth_headers):
        resp = client.post("/api/policy-configs", headers=admin_auth_headers, json={
            "name": "strict-scan",
            "description": "Strict scanning pipeline",
            "config_type": "scanning_pipeline",
            "config": {
                "block_categories": ["direct_injection", "jailbreak"],
                "attack_patterns": [],
                "block_on_first_threat": True,
                "min_confidence_threshold": 0.5,
                "block_score_threshold": 3.0,
            },
        })
        assert resp.status_code == 201
        assert resp.json()["config_type"] == "scanning_pipeline"

    def test_list_configs(self, client, admin_auth_headers):
        resp = client.get("/api/policy-configs", headers=admin_auth_headers)
        assert resp.status_code == 200

    def test_get_config(self, client, admin_auth_headers):
        resp = client.post("/api/policy-configs", headers=admin_auth_headers, json={
            "name": "config-to-get",
            "description": "",
            "config_type": "scanning_pipeline",
            "config": {"block_categories": [], "attack_patterns": [], "block_on_first_threat": False},
        })
        cfg_id = resp.json()["id"]
        resp = client.get(f"/api/policy-configs/{cfg_id}", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "config-to-get"

    def test_update_config(self, client, admin_auth_headers):
        resp = client.post("/api/policy-configs", headers=admin_auth_headers, json={
            "name": "updatable-config",
            "description": "",
            "config_type": "scanning_pipeline",
            "config": {"block_categories": [], "attack_patterns": [], "block_on_first_threat": False},
        })
        cfg_id = resp.json()["id"]
        resp = client.put(f"/api/policy-configs/{cfg_id}", headers=admin_auth_headers, json={
            "name": "updated-config",
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "updated-config"

    def test_delete_config(self, client, admin_auth_headers):
        resp = client.post("/api/policy-configs", headers=admin_auth_headers, json={
            "name": "delete-config",
            "description": "",
            "config_type": "scanning_pipeline",
            "config": {"block_categories": [], "attack_patterns": [], "block_on_first_threat": False},
        })
        cfg_id = resp.json()["id"]
        resp = client.delete(f"/api/policy-configs/{cfg_id}", headers=admin_auth_headers)
        assert resp.status_code == 204

    def test_policy_with_config_ref(self, client, admin_auth_headers):
        """Create a policy that references a scanning_pipeline config."""
        resp = client.post("/api/policy-configs", headers=admin_auth_headers, json={
            "name": "ref-config",
            "description": "Referenced by policy",
            "config_type": "scanning_pipeline",
            "config": {
                "block_categories": ["direct_injection"],
                "attack_patterns": [],
                "block_on_first_threat": True,
                "min_confidence_threshold": 0.3,
                "block_score_threshold": 5.0,
            },
        })
        cfg_id = resp.json()["id"]
        resp = client.post("/api/policies", headers=admin_auth_headers, json={
            "name": "policy-with-config-ref",
            "description": "Uses a config reference",
            "scanning_pipeline_config_id": cfg_id,
        })
        assert resp.status_code == 201


class TestPolicyPreview:
    def test_preview_blocked(self, client, admin_auth_headers):
        resp = client.post("/api/policies/preview", headers=admin_auth_headers, json={
            "text": "This contains a secret word",
            "rules": [
                {"name": "block-secret", "phrases": ["secret"], "mode": "hard"},
            ],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["blocked"] is True
        assert "secret" in data["matched_phrases"]

    def test_preview_clean(self, client, admin_auth_headers):
        resp = client.post("/api/policies/preview", headers=admin_auth_headers, json={
            "text": "This is a clean message",
            "rules": [
                {"name": "block-secret", "phrases": ["secret"], "mode": "hard"},
            ],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["blocked"] is False
        assert data["matched_phrases"] == []


class TestPolicyExportImport:
    def test_export_yaml(self, client, admin_auth_headers, seeded_policy):
        resp = client.get(
            f"/api/policies/{seeded_policy['id']}/export",
            headers=admin_auth_headers,
        )
        assert resp.status_code == 200
        assert b"test-policy" in resp.content
        assert b"block-test" in resp.content or b"test" in resp.content

    def _set_admin_cookies(self, client, admin_auth_headers):
        """Set admin cookies on the client from the headers dict."""
        cookie_str = admin_auth_headers.get("Cookie", "")
        for part in cookie_str.split(";"):
            part = part.strip()
            if "=" in part:
                name, val = part.split("=", 1)
                client.cookies.set(name, val)

    def test_import_yaml(self, client, admin_auth_headers):
        yaml_content = b"""
name: imported-policy
description: Imported from YAML
rules:
  - phrase: secret
    mode: hard
  - phrase: admin
    mode: bias
    penalty: 5.0
"""
        self._set_admin_cookies(client, admin_auth_headers)
        resp = client.post(
            "/api/policies/import",
            headers={"X-CSRF-Token": admin_auth_headers.get("X-CSRF-Token", "")},
            files={"file": ("policy.yaml", yaml_content, "application/x-yaml")},
        )
        assert resp.status_code in (200, 201), resp.text
        assert resp.json()["name"] == "imported-policy"

    def test_export_import_roundtrip(self, client, admin_auth_headers, seeded_policy):
        """Export a policy then import it under a different name."""
        resp = client.get(
            f"/api/policies/{seeded_policy['id']}/export",
            headers=admin_auth_headers,
        )
        assert resp.status_code == 200
        yaml_content = resp.content.replace(b"test-policy", b"roundtrip-policy")
        self._set_admin_cookies(client, admin_auth_headers)
        resp = client.post(
            "/api/policies/import",
            headers={"X-CSRF-Token": admin_auth_headers.get("X-CSRF-Token", "")},
            files={"file": ("roundtrip.yaml", yaml_content, "application/x-yaml")},
        )
        assert resp.status_code in (200, 201), resp.text
        assert resp.json()["name"] == "roundtrip-policy"


class TestPolicyBulk:
    def test_create_50_policies(self, client, admin_auth_headers):
        for i in range(50):
            resp = client.post("/api/policies", headers=admin_auth_headers, json={
                "name": f"bulk-policy-{i:03d}",
                "description": f"Bulk test policy #{i}",
                "rules": [
                    {"name": f"rule-{i}", "phrases": [f"phrase-{i}"], "mode": "hard"},
                ],
            })
            assert resp.status_code == 201

        resp = client.get("/api/policies", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 50

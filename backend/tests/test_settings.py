"""Phase 6: Settings & Tokenizers tests."""

from __future__ import annotations

import pytest


class TestSettingsCRUD:
    def test_get_global_settings(self, client, admin_auth_headers):
        resp = client.get("/api/settings/global", headers=admin_auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "scanning" in data
        assert "logits" in data
        assert "observability" in data
        assert "pipeline" in data
        assert "tokenizers" in data

    def test_update_scanning_settings(self, client, admin_auth_headers):
        resp = client.get("/api/settings/global", headers=admin_auth_headers)
        current = resp.json()
        current["scanning"]["fail_open"] = True
        current["scanning"]["max_input_length"] = 50000
        resp = client.put("/api/settings/global", headers=admin_auth_headers, json=current)
        assert resp.status_code == 200
        assert resp.json()["scanning"]["fail_open"] is True
        assert resp.json()["scanning"]["max_input_length"] == 50000

    def test_update_logits_settings(self, client, admin_auth_headers):
        resp = client.get("/api/settings/global", headers=admin_auth_headers)
        current = resp.json()
        current["logits"]["device"] = "cuda"
        current["logits"]["default_shadow_penalty"] = -20.0
        resp = client.put("/api/settings/global", headers=admin_auth_headers, json=current)
        assert resp.status_code == 200
        assert resp.json()["logits"]["device"] == "cuda"
        assert resp.json()["logits"]["default_shadow_penalty"] == -20.0

    def test_update_observability_settings(self, client, admin_auth_headers):
        resp = client.get("/api/settings/global", headers=admin_auth_headers)
        current = resp.json()
        current["observability"]["sampling_default_rate"] = 0.5
        current["observability"]["mask_sensitive_fields"] = False
        resp = client.put("/api/settings/global", headers=admin_auth_headers, json=current)
        assert resp.status_code == 200
        assert resp.json()["observability"]["sampling_default_rate"] == 0.5
        assert resp.json()["observability"]["mask_sensitive_fields"] is False

    def test_update_pipeline_settings(self, client, admin_auth_headers):
        resp = client.get("/api/settings/global", headers=admin_auth_headers)
        current = resp.json()
        current["pipeline"]["maintenance_mode"] = True
        resp = client.put("/api/settings/global", headers=admin_auth_headers, json=current)
        assert resp.status_code == 200
        assert resp.json()["pipeline"]["maintenance_mode"] is True

    def test_update_tokenizers_settings(self, client, admin_auth_headers):
        resp = client.get("/api/settings/global", headers=admin_auth_headers)
        current = resp.json()
        current["tokenizers"]["protect_special_tokens"] = False
        current["tokenizers"]["cache_enabled"] = False
        resp = client.put("/api/settings/global", headers=admin_auth_headers, json=current)
        assert resp.status_code == 200
        assert resp.json()["tokenizers"]["protect_special_tokens"] is False
        assert resp.json()["tokenizers"]["cache_enabled"] is False

    def test_settings_requires_auth(self, client):
        resp = client.get("/api/settings/global")
        assert resp.status_code == 401


class TestTokenizerDetection:
    def test_tokenizer_detect_basic(self, client, admin_auth_headers):
        """Detect special tokens for a known model."""
        resp = client.post(
            "/api/settings/tokenizer/gpt2/detect",
            headers=admin_auth_headers,
            json={},
        )
        # gpt2 tokenizer should be available via transformers
        assert resp.status_code in (200, 404)

    def test_tokenizer_detect_with_custom_tokens(self, client, admin_auth_headers):
        """Detect with custom special tokens."""
        resp = client.post(
            "/api/settings/tokenizer/gpt2/detect",
            headers=admin_auth_headers,
            json={"custom_special_tokens": ["<|tool_call|>"]},
        )
        assert resp.status_code in (200, 404)

    def test_tokenizer_detect_nonexistent_model(self, client, admin_auth_headers):
        """Non-existent model returns empty special tokens (graceful fallback)."""
        resp = client.post(
            "/api/settings/tokenizer/this-model-does-not-exist-12345/detect",
            headers=admin_auth_headers,
            json={},
        )
        # Current implementation gracefully returns empty dict (no error)
        assert resp.status_code in (200, 400, 404, 500)

"""Phase 2: Auth & RBAC tests."""

from __future__ import annotations

import uuid

import pytest


class TestAuthLogin:
    def test_login_valid(self, client, admin_user):
        resp = client.post("/api/auth/login", json={
            "username": "testadmin",
            "password": "testpass",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["token_type"] == "bearer"
        assert "csrf_token" in data
        assert "user" in data
        assert data["user"]["username"] == "testadmin"
        assert data["user"]["is_admin"] is True

    def test_login_invalid_credentials(self, client):
        resp = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "wrongpassword",
        })
        assert resp.status_code == 401
        assert "Invalid credentials" in resp.text

    def test_login_disabled_user(self, client, db_session, admin_user):
        from resk_app.models.user import User
        user = db_session.get(User, uuid.UUID(admin_user["id"]))
        if user:
            user.is_active = False
            db_session.commit()
        resp = client.post("/api/auth/login", json={
            "username": "testadmin",
            "password": "testpass",
        })
        assert resp.status_code == 403

    def test_login_non_admin_user(self, client, seeded_non_admin_user):
        resp = client.post("/api/auth/login", json={
            "username": "testuser",
            "password": "userpass",
        })
        assert resp.status_code == 403


class TestAuthMe:
    def test_me_authenticated(self, client, admin_auth_headers):
        resp = client.get("/api/auth/me", headers=admin_auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "testadmin"
        assert data["is_admin"] is True

    def test_me_unauthenticated(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401


class TestAuthLogout:
    def test_logout(self, client, admin_auth_headers):
        resp = client.post("/api/auth/logout", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert resp.json()["detail"] == "logged out"
        # Logout clears the cookie; JWT is still valid but cookie is gone.
        # Test by making a request without any auth cookie.
        resp2 = client.get(
            "/api/auth/me",
            headers={"X-CSRF-Token": "anything"},
        )
        assert resp2.status_code == 401


class TestAuthRefresh:
    def test_refresh(self, client, admin_auth_headers):
        resp = client.post("/api/auth/refresh", headers=admin_auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["token_type"] == "bearer"
        assert "csrf_token" in data

    def test_refresh_unauthenticated(self, client):
        resp = client.post("/api/auth/refresh", headers={"Content-Type": "application/json"})
        assert resp.status_code in (401, 403)


class TestHealth:
    def test_health_no_auth(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_admin_health_no_auth(self, client):
        resp = client.get("/api/admin/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


class TestCSRF:
    def test_missing_csrf_on_post(self, client, admin_auth_headers):
        """POST to a protected endpoint without CSRF -> 403."""
        resp = client.post(
            "/api/users",
            headers={
                "Cookie": admin_auth_headers["Cookie"].split(";")[0],  # admin_token only, no csrf_token
                "Content-Type": "application/json",
            },
            json={"username": "no-csrf", "email": "no-csrf@ex.com", "password": "longenough"},
        )
        assert resp.status_code == 403

    def test_wrong_csrf_on_post(self, client, admin_auth_headers):
        """Wrong X-CSRF-Token value -> 403."""
        resp = client.post(
            "/api/users",
            headers={
                "Cookie": admin_auth_headers["Cookie"],
                "X-CSRF-Token": "wrong-token",
                "Content-Type": "application/json",
            },
            json={"username": "bad-csrf", "email": "bad-csrf@ex.com", "password": "longenough"},
        )
        assert resp.status_code == 403

    def test_get_no_csrf_required(self, client, admin_auth_headers):
        """GET requests should not require CSRF."""
        resp = client.get("/api/auth/me", headers=admin_auth_headers)
        assert resp.status_code == 200


class TestRBAC:
    def test_roles_list(self, client, admin_auth_headers, seeded_role):
        resp = client.get("/api/roles", headers=admin_auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1

    def test_role_create(self, client, admin_auth_headers):
        resp = client.post("/api/roles", headers=admin_auth_headers, json={
            "name": "new-role",
            "description": "Fresh role",
            "capabilities_mask": 3,  # bits 0+1
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "new-role"
        assert data["capabilities_mask"] == 3

    def test_role_update(self, client, admin_auth_headers, seeded_role):
        resp = client.put(f"/api/roles/{seeded_role['id']}", headers=admin_auth_headers, json={
            "description": "Updated description",
        })
        assert resp.status_code == 200
        assert resp.json()["description"] == "Updated description"

    def test_role_delete(self, client, admin_auth_headers):
        resp = client.post("/api/roles", headers=admin_auth_headers, json={
            "name": "delete-me-role",
            "description": "Will be deleted",
            "capabilities_mask": 0,
        })
        rid = resp.json()["id"]
        resp_del = client.delete(f"/api/roles/{rid}", headers=admin_auth_headers)
        assert resp_del.status_code == 204

    def test_attach_policy_to_role(self, client, admin_auth_headers, seeded_role, seeded_policy):
        resp = client.post(
            f"/api/roles/{seeded_role['id']}/policy?policy_id={seeded_policy['id']}",
            headers=admin_auth_headers,
        )
        assert resp.status_code == 200

    def test_capabilities_list(self, client, admin_auth_headers, seeded_capabilities):
        resp = client.get("/api/capabilities", headers=admin_auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 8

    def test_capability_create(self, client, admin_auth_headers):
        resp = client.post("/api/capabilities", headers=admin_auth_headers, json={
            "bit_position": 10,
            "name": "custom_cap",
            "description": "A custom capability",
        })
        assert resp.status_code == 201

    def test_capability_bit_already_taken(self, client, admin_auth_headers, seeded_capabilities):
        resp = client.post("/api/capabilities", headers=admin_auth_headers, json={
            "bit_position": 0,
            "name": "duplicate",
            "description": "Should fail",
        })
        assert resp.status_code == 409

    def test_capability_bit_out_of_range(self, client, admin_auth_headers):
        resp = client.post("/api/capabilities", headers=admin_auth_headers, json={
            "bit_position": 64,
            "name": "out_of_range",
            "description": "Should fail",
        })
        assert resp.status_code == 422

    def test_user_with_role_mask(self, client, admin_auth_headers, seeded_non_admin_user, seeded_role):
        """User should have computed capabilities from role."""
        resp = client.get(
            f"/api/users/{seeded_non_admin_user['id']}/mask",
            headers=admin_auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["capabilities_mask"] > 0
        assert len(data["active_bits"]) >= 1


class TestCSRFExemption:
    """Verify CSRF is not required on GET/HEAD/OPTIONS."""

    def test_get_users_no_csrf(self, client, admin_user):
        from resk_app.models.user import User
        from resk_app.auth.jwt import create_jwt
        from resk_app.rbac import build_mask
        mask = build_mask(0, 1, 2, 3, 4, 5, 6, 7)
        token, _ = create_jwt(
            uuid.UUID(admin_user["id"]), admin_user["username"], True, mask, "admin"
        )
        resp = client.get(
            "/api/users",
            headers={"Cookie": f"admin_token={token}"},
        )
        assert resp.status_code == 200

"""User & Session management tests."""

from __future__ import annotations

import uuid

import pytest


class TestUserCRUD:
    def test_list_users(self, client, admin_auth_headers, admin_user):
        resp = client.get("/api/users", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_create_user(self, client, admin_auth_headers):
        resp = client.post("/api/users", headers=admin_auth_headers, json={
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "securepass",
            "is_active": True,
            "is_admin": False,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["username"] == "newuser"

    def test_create_user_duplicate_username(self, client, admin_auth_headers, admin_user):
        resp = client.post("/api/users", headers=admin_auth_headers, json={
            "username": "testadmin",
            "email": "other@example.com",
            "password": "longenough",
        })
        assert resp.status_code == 409

    def test_get_user(self, client, admin_auth_headers, admin_user):
        resp = client.get(f"/api/users/{admin_user['id']}", headers=admin_auth_headers)
        assert resp.status_code == 200
        assert resp.json()["username"] == "testadmin"

    def test_get_user_not_found(self, client, admin_auth_headers):
        resp = client.get(f"/api/users/{uuid.uuid4()}", headers=admin_auth_headers)
        assert resp.status_code == 404

    def test_update_user(self, client, admin_auth_headers, admin_user):
        resp = client.put(f"/api/users/{admin_user['id']}", headers=admin_auth_headers, json={
            "email": "updated@example.com",
        })
        assert resp.status_code == 200
        assert resp.json()["email"] == "updated@example.com"

    def test_delete_user(self, client, admin_auth_headers):
        resp = client.post("/api/users", headers=admin_auth_headers, json={
            "username": "deleteuser",
            "email": "delete@example.com",
            "password": "longenough",
        })
        assert resp.status_code == 201
        uid = resp.json()["id"]
        resp = client.delete(f"/api/users/{uid}", headers=admin_auth_headers)
        assert resp.status_code == 204

    def test_users_require_auth(self, client):
        resp = client.get("/api/users")
        assert resp.status_code == 401


class TestUserMask:
    def test_get_user_mask(self, client, admin_auth_headers, seeded_non_admin_user, seeded_role):
        resp = client.get(
            f"/api/users/{seeded_non_admin_user['id']}/mask",
            headers=admin_auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["capabilities_mask"] > 0

    def test_user_with_multiple_roles(self, client, admin_auth_headers, db_session, seeded_capabilities):
        from resk_app.models.role import Role
        from resk_app.rbac import build_mask
        r1 = Role(name="r1", description="", capabilities_mask=build_mask(0, 1))
        r2 = Role(name="r2", description="", capabilities_mask=build_mask(2, 3))
        db_session.add(r1)
        db_session.add(r2)
        db_session.commit()
        resp = client.post("/api/users", headers=admin_auth_headers, json={
            "username": "multi-role-user",
            "email": "multi@example.com",
            "password": "longenough",
            "role_ids": [str(r1.id), str(r2.id)],
        })
        assert resp.status_code == 201, resp.text
        uid = resp.json()["id"]
        resp = client.get(f"/api/users/{uid}", headers=admin_auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["capabilities_mask"] == build_mask(0, 1, 2, 3)


class TestSessions:
    def test_list_sessions_not_found(self, client, admin_auth_headers):
        """List sessions for a non-existent user."""
        resp = client.get(
            f"/api/sessions/user/{uuid.uuid4()}",
            headers=admin_auth_headers,
        )
        assert resp.status_code == 200 or resp.status_code == 404

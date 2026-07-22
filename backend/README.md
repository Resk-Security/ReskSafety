# RESK backend

Deployable LLM firewall application: RBAC (bitmask capabilities), policies, and an
OpenAI-compatible firewall endpoint backed by `resklogits`.

## Quick start

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e .
cp .env.example .env
uvicorn resk_app.main:app --reload --port 8000
```

On first startup the DB is created (SQLite by default) and a default admin user is
seeded: `admin` / `changeme` (Argon2).

## Optional: local logits filtering

For real logits-level filtering, install the local cores:

```bash
pip install -e ../../resk-logits      # resklogits
pip install -e ../../Resk-LLM         # resk2 (optional, RESK2_ENABLED=true)
```

When `resklogits` is absent, the firewall falls back to naive substring
post-filtering on the response.

## Configuration

See `.env.example` for all variables.

## API

- Auth: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- Admin CRUD: `/api/users`, `/api/roles`, `/api/policies`, `/api/capabilities`
- Firewall: `POST /v1/chat/completions`, `POST /v1/tokenize`
- Supervision: `GET /api/admin/stats`, `GET /api/admin/logs`

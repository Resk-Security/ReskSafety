# Resk

## What this codebase does
Full-stack LLM firewall (FastAPI + React) with RBAC, 64-bit capability bitmasks per role, editable filtering policies (banned phrases, token biases), and an OpenAI-compatible proxy endpoint (`POST /v1/chat/completions`). Proxies to OpenAI, vLLM, Ollama, DeepSeek, or local transformers via resklogits. Admin console for users, roles, policies, providers, sessions, logs, audit trail, and stats. Auth is JWT in httpOnly cookies + CSRF Double-Submit Cookie pattern, Argon2 password hashing.

## Auth shape
- `get_current_admin()` / `get_current_user()` in `auth/dependencies.py` — JWT from httpOnly cookie or Bearer header, capability-mask extraction
- `create_jwt()` / `decode_jwt()` in `auth/jwt.py` — HS256, CSRF claim embedded
- Double-Submit CSRF: non-httpOnly `csrf_token` cookie → `X-CSRF-Token` header verified server-side on admin mutations
- `compute_user_mask()` in `rbac/mask.py` — OR of all role capability masks
- `has_capability()` in `rbac/capabilities.py` — bit-position check
- MCP server at `mcp-server/main.py` uses `verify=False` on httpx

## Threat model
- Privilege escalation via role/policy manipulation (JWT forgery, CSRF bypass, capability mask tampering)
- Provider API key exfiltration (encrypted at rest with Fernet, but decryption key may be absent)
- Firewall bypass: crafting requests that evade policy scanning or post-filtering
- Session hijacking: if httpOnly cookie or CSRF token is leaked
- Direct DB access if SQLite file is exposed or PostgreSQL credentials leaked

## Project-specific patterns to flag
- `verify=False` in `mcp-server/main.py` — disables TLS verification for httpx client
- Default credentials `admin`/`changeme` in `seed.py` — hardcoded seed, must be changed in prod
- `PROVIDER_ENCRYPTION_KEY` with no default — if empty, Fernet encryption silently degrades
- `fail_open` flag in policy scanning — if resklogits is unavailable, falls back to naive post-filtering
- SQLite auto-migration in `db/base.py` — ALTER TABLE hack that won't work on PostgreSQL
- JWT and CSRF secrets defaulting to `change-me-*` strings in `.env.example`

## Known false-positives
- `verify=False` in MCP client is intentional for loopback dev, but flagged by SSRF matchers
- Default credentials exist in seed code but are overwritten if user changes password via UI
- `LLM_BACKEND_API_KEY` in config may be empty in dev (env var set externally in prod)
- The SQLite migration code in `db/base.py` is dev-only; prod uses Alembic with PostgreSQL

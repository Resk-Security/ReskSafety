# RESK — Deployable LLM Firewall

RESK is a full-stack application (FastAPI + React) that provides:

- **RBAC** with a 64-bit capability bitmask per role.
- **Editable filtering policies** (banned phrases, hard/bias modes, penalties).
- An **OpenAI-compatible firewall** endpoint (`POST /v1/chat/completions`) backed by
  [`resklogits`](../resk-logits) for logits-level filtering, or naive post-filtering
  for distant backends.
- **Multi-provider support**: route requests to any OpenAI-compatible provider
  (OpenAI, vLLM, Ollama, custom) via the `X-Provider-Id` header or admin configuration.
- **Agent session tracking** via reskPoints bridge.
- An **admin console** (users, roles, policies, providers, sessions, logs, stats, audit log, D3 network graph).

The capability bitmask is a purely applicative abstraction: `resklogits` only sees
lists of banned tokens. The bridge is the `Policy` (stored in DB), which associates
a mask with `logit_rules` + `tool_whitelist`.

```
Resk/
├── backend/   # FastAPI: RBAC, JWT (httpOnly cookie), firewall, admin
├── frontend/  # Vite + React + TS + Tailwind (shadcn-style)
├── start.sh   # One-command launcher (backend + frontend)
└── docker-compose.yml / docker-compose.dev.yml
```

## Tooling

### Frontend
- **Runtime**: [Bun](https://bun.sh) >= 1.x (replaces npm)
- **Framework**: React 18 + TypeScript
- **Build**: Vite 5
- **UI**: Tailwind CSS + shadcn-style components
- **Libraries**: D3.js (force graph), Chart.js (sessions), Lucide (icons)

### Backend
- **Runtime**: Python >= 3.12
- **Framework**: FastAPI + SQLAlchemy 2.0 (async-ready ORM)
- **Auth**: Argon2 hashing + JWT (httpOnly cookies) + CSRF (Double Submit Cookie)
- **Rate limiting**: `slowapi` (Sliding Window)
- **DB**: SQLite (dev) / PostgreSQL (prod)

## Quick start (local dev)

### One command (requires Python 3.12+, Bun)

```bash
./start.sh
```

This will:
1. Create a Python venv + install deps (first run)
2. Seed the SQLite DB with default admin (`admin` / `changeme`)
3. Start the backend on `:8000`
4. Install frontend deps with Bun (first run)
5. Start the frontend on `:5173`

Press **Ctrl+C** to stop both.

### Manual start

#### Backend
```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -e .
cp .env.example .env
uvicorn resk_app.main:app --reload --port 8000
```
On first start, the DB is created (SQLite) and a default admin is seeded:
**`admin` / `changeme`** (Argon2). 8 default capabilities are inserted (bits 0–7).

### Optional: real logits filtering
```bash
pip install -e ../resk-logits      # resklogits (ShadowBanProcessor, VectorizedAhoCorasick)
pip install -e ../Resk-LLM         # resk2 (optional; set RESK2_ENABLED=true)
```
When `resklogits` is absent, the firewall falls back to naive substring
post-filtering on the LLM response.

### Frontend
```bash
cd frontend
bun install
bun run dev        # http://localhost:5173 (proxies /api and /v1 to :8000)
```

Build production :
```bash
bun run build       # tsc + vite build, output in dist/
```

## Docker

```bash
# Dev (builds from source, mounts local cores read-only)
docker compose -f docker-compose.dev.yml up --build

# Prod (pre-built images from registry + PostgreSQL)
docker compose up -d
```

## Architecture

```
UI (React) ──HTTP──▶ FastAPI backend
                        ├─ Auth: Argon2 + JWT (httpOnly cookie) + CSRF
                        ├─ RBAC: Capability(bit 0..63) → Role.mask → User.mask = OR
                        ├─ CRUD: users / roles / policies / capabilities / providers
                        ├─ Providers /api/providers: CRUD for LLM backends
                        ├─ Sessions /api/sessions: agent session tracking via webhook
                        ├─ Firewall /v1/chat/completions:
                        │    JWT(user, mask) → policy → compile_policy()
                        │    → resklogits ShadowBanProcessor (local) | post-filter (distant)
                        │    → tool_call capability check (bit 0)
                        │    → optional X-Provider-Id → route to configured provider
                        │    → RequestLog
                        ├─ Admin: /stats, /logs, /graph (D3), /changelog (audit)
                        └─ reskPoints bridge: /api/sessions/record (API-key auth)
```

### Two control levels (decoupled)
| Layer        | Responsibility                          | Knows about        |
|--------------|------------------------------------------|--------------------|
| Application  | RBAC, bitmask, JWT, tool gating          | users, capabilities|
| `resklogits` | logits masking / token banning           | token IDs only     |
| Bridge       | `Policy.logit_rules` → banned phrases    | rules, tokenizer   |

### How the capabilities_mask is applied to external providers

The `capabilities_mask` is a **RESK-side access control system** — it never reaches
the external LLM provider. The pipeline is:

```
Client → RESK Firewall
          1. Decode JWT → get user roles + capabilities_mask
          2. Tool check: if bit 0 (can_call_tools) is not set, block 403
          3. Compile policies → build banned phrases / token biases
          4. Route to provider (env vars or X-Provider-Id override)
          5. Post-filter: scan response with Aho-Corasick
        → Client
```

The mask controls:
- **Before** the call: tool gating, policy compilation (banned phrases → token bans)
- **After** the call: response post-filtering (Aho-Corasick scan)
- The provider only sees messages/tools that passed the mask; it never receives
  the mask itself

### Provider routing

Providers are managed via the UI (CRUD). Each provider stores:
- `endpoint` (e.g. `https://api.openai.com/v1`)
- `api_key` (encrypted with AES via `PROVIDER_ENCRYPTION_KEY`)
- `models`, `default_model`, `stream_supported`
- `provider_type` (openai / vllm / ollama / custom)

To route a specific call to a provider, send the HTTP header:
```
X-Provider-Id: <provider-uuid>
```
If absent, the firewall falls back to `LLM_BACKEND_URL` / `LLM_BACKEND_API_KEY` env vars.

## Configuration

See `backend/.env.example`. Key variables:

| Var | Default | Description |
|-----|---------|-------------|
| `DATABASE_URL` | `sqlite:///./resk.db` | SQLAlchemy URL (PG in prod) |
| `JWT_SECRET_KEY` | — | JWT signing secret |
| `LLM_BACKEND_TYPE` | `openai` | `openai` \| `vllm` \| `ollama` \| `local` |
| `LLM_BACKEND_URL` | `https://api.openai.com/v1` | LLM endpoint |
| `LLM_BACKEND_API_KEY` | — | Bearer key for distant LLM |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Comma-separated origins |
| `LOG_PROMPTS` | `false` | Store prompt hash; if true, also truncated prompt |
| `RATE_LIMIT_PER_MINUTE` | `60` | Firewall endpoint rate limit |
| `RESK2_ENABLED` | `false` | Enable resk2 (Resk-LLM) middleware |

## API summary

- **Auth** (httpOnly cookie): `POST /api/auth/login`, `GET /api/auth/me`,
  `POST /api/auth/logout`, `POST /api/auth/refresh`
- **Admin CRUD**: `/api/users`, `/api/roles` (+`POST /{id}/policy`),
  `/api/policies` (+`/preview`, `/export`, `/import`), `/api/capabilities`,
  `/api/providers` (+`/{id}/test`),
  `GET /api/users/{id}/mask`
- **Firewall** (Bearer JWT user): `POST /v1/chat/completions`, `POST /v1/tokenize`
- **Supervision**: `GET /api/admin/stats`, `GET /api/admin/logs`,
  `GET /api/admin/graph` (D3 force graph data),
  `GET /api/admin/changelog` (audit trail)
- **Sessions** (admin JWT): `GET /api/sessions/user/{id}`,
  `GET /api/sessions/user/{id}/stats`, `GET /api/sessions/user/{id}/tools`
- **Sessions** (API key): `POST /api/sessions/record` (reskPoints webhook)

## Using RESK with Claude Code

Claude Code can use RESK as a secured proxy for LLM calls. Two approaches:

### 1. Via environment (simplest — single provider)

Point Claude Code to RESK's firewall endpoint:

```bash
# In your project's .claude/settings.json or CLAUDE.md
# Set the LLM endpoint to RESK
export ANTHROPIC_BASE_URL="http://localhost:8000/v1"
# OR for OpenAI-compatible mode:
export OPENAI_API_BASE="http://localhost:8000/v1"
```

RESK will use `LLM_BACKEND_URL` / `LLM_BACKEND_API_KEY` (or the default provider)
to proxy the request. Authentication is handled by JWT — you'll need to obtain a
token first (see Option 2).

### 2. Via Bearer JWT — programmatic

Claude Code can pass a JWT obtained from RESK auth:

```bash
# 1. Login to get JWT
JWT=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"changeme"}' \
  -c /tmp/resk_cookies.txt | jq -r '.access_token')

# 2. Use the JWT in API calls
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -H "X-Provider-Id: <provider-uuid>" \  # optional
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

The JWT carries the user's roles + capabilities_mask. RESK applies:
- **Tool gating** (bit 0): blocks tool calls if the user's mask doesn't allow it
- **Policy filtering**: bans phrases / biases tokens based on attached policies
- **Post-filtering**: scans the generated response

### 3. Claude Code config file

Create `.claude/settings.json`:

```json
{
  "apiKey": "your-resk-jwt-token",
  "baseUrl": "http://localhost:8000/v1",
  "model": "gpt-4o-mini"
}
```

The `X-Provider-Id` header can be added via a custom HTTP middleware or by
configuring the provider directly in the RESK admin UI so it becomes the
default route.

## Default capabilities (bits 0–7)

| Bit | Name | Description |
|-----|------|-------------|
| 0 | `can_call_tools` | Call functions/tools |
| 1 | `can_generate_code` | Generate executable code |
| 2 | `db_read` | Read database |
| 3 | `db_write` | Write to database |
| 4 | `can_send_email` | Send emails |
| 5 | `can_access_pii` | Access personal data |
| 6 | `can_manage_users` | Manage users |
| 7 | `can_configure_system` | Modify configuration |

Editable from the UI (Capabilities are a CRUD table). Bits 8–63 are free.

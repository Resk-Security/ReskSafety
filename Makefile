# RESK — make shortcuts

.PHONY: build up down logs psql token

# ── Build & run ──

build:
	docker compose build

up:
	docker compose up -d

up-headless:
	docker compose up -d backend db

down:
	docker compose down

logs:
	docker compose logs -f

psql:
	docker compose exec db psql -U resk

# ── Admin token ──

token:
	@read -p "Username: " u; \
	 curl -s -X POST http://localhost:8000/api/auth/user-login \
	   -H "Content-Type: application/json" \
	   -d "{\"username\": \"$$u\", \"password\": \"$$u\"}" | \
	   python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))"

# ── Quick test ──

smoke:
	@echo "=== RESK Smoke Test ==="; \
	 curl -s http://localhost:8000/health; echo ""; \
	 TOKEN=$$(curl -s -X POST http://localhost:8000/api/auth/user-login \
	   -H "Content-Type: application/json" \
	   -d '{"username":"admin","password":"changeme"}' | \
	   python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))"); \
	 echo "Token: $${TOKEN:0:20}..."; \
	 curl -s -H "Authorization: Bearer $$TOKEN" http://localhost:8000/v1/models | \
	   python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Models: {len(d[\"data\"])}'); [print(f'  - {m[\"id\"]}') for m in d['data']]"

# ── Clean ──

clean:
	docker compose down -v

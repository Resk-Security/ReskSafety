#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
  wait 2>/dev/null
  echo "Done."
}
trap cleanup EXIT INT TERM

# ── Backend ──
echo "Starting backend..."
cd "$ROOT/backend"
if [ ! -d .venv ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv .venv
fi
. .venv/bin/activate
if [ ! -f data/resk.db ]; then
  echo "  Seeding database..."
  PYTHONPATH=src python -m resk_app.seed
fi
PYTHONPATH=src .venv/bin/uvicorn resk_app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "  Backend PID $BACKEND_PID — http://localhost:8000"

# ── Frontend ──
echo "Starting frontend..."
cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
  echo "  Installing dependencies..."
  bun install
fi
bun run dev &
FRONTEND_PID=$!
echo "  Frontend PID $FRONTEND_PID — http://localhost:5173"

echo ""
echo "RESK is running:"
echo "  Backend  → http://localhost:8000  (docs: /docs)"
echo "  Frontend → http://localhost:5173"
echo ""
echo "Login: admin / changeme"
echo "Press Ctrl+C to stop."

wait
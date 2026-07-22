# RESK Backend — multi-stage Docker build
# Uses uv for fast dependency resolution, then slim runtime image.

# ── Builder ──
FROM python:3.13-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_CACHE_DIR=/tmp/uv-cache

RUN pip install --no-cache-dir uv

WORKDIR /build

# Cache dependencies first
COPY pyproject.toml README.md uv.lock* ./
RUN mkdir -p src/resk_app && touch src/resk_app/__init__.py
RUN uv pip install --system -e . 2>/dev/null || pip install --no-cache-dir -e .

# ── Runtime ──
FROM python:3.13-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install runtime system deps (none for now)
# RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends ... && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy app source
COPY src ./src
COPY pyproject.toml README.md ./

# Health check
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

EXPOSE 8000

CMD ["uvicorn", "resk_app.main:app", "--host", "0.0.0.0", "--port", "8000"]

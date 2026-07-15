# syntax=docker/dockerfile:1
# Verse2 — single image that runs both the Node API and the Python audio sidecar.
# Build:  docker build -t verse2 .
# Run:    docker run -p 3000:3000 --env-file .env verse2

FROM node:20-bookworm-slim AS node-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:20-bookworm-slim AS python-deps
WORKDIR /tmp
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-pip build-essential libsndfile1 \
    && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir \
      "librosa>=0.11,<0.12" \
      "soundfile>=0.12" \
      "numpy>=1.26" \
      "scipy>=1.11" \
      "scikit-learn>=1.3" \
      "fastapi>=0.110" \
      "uvicorn[standard]>=0.29" \
      "python-multipart>=0.0.9"

FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv libsndfile1 fonts-liberation libnss3 libatk1.0-0 libatk-bridge2.0-0 \
      libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
      libpango-1.0-0 libcairo2 libasound2 libpangocairo-1.0-0 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Node deps
COPY --from=node-deps /app/node_modules /app/node_modules
COPY package.json package-lock.json* ./
COPY tsconfig.json ./
COPY src ./src
COPY web ./web
# Optionally include .env.production if present (gitignored). Lets us inject
# runtime secrets at build time when the platform doesn't expose them.
COPY .env.production* ./
RUN npx tsc

# Python venv from the previous stage
COPY --from=python-deps /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY sidecar /app/sidecar
COPY demo-track.wav /app/demo-track.wav
ENV PYTHONUNBUFFERED=1

# Supervisor script that runs both the sidecar and the API in one container.
RUN cat > /app/start.sh <<'EOF'
#!/bin/bash
set -e
cd /app
uvicorn server:app --host 127.0.0.1 --port 8077 --app-dir sidecar &
SIDECAR_PID=$!
trap "kill -TERM $SIDECAR_PID 2>/dev/null || true" EXIT
# Wait for sidecar health
for i in $(seq 1 30); do
  if curl -sSf http://127.0.0.1:8077/health > /dev/null 2>&1; then
    break
  fi
  sleep 1
done
exec node dist/server.js
EOF
RUN chmod +x /app/start.sh

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    SIDECAR_URL=http://127.0.0.1:8077 \
    PUBLIC_BASE_URL=https://verse2.org \
    RECEIVING_WALLET_ADDRESS=0x72233b78747765244855dd27180bbed9c0245f96 \
    X402_NETWORK=eip155:196 \
    X402_ASSET=0x779ded0c9e1022225f8e0630b35a9b54be713736 \
    X402_PACKAGE_PRICE=2.0 \
    X402_REVISION_PRICE=0.3 \
    DATA_DIR=./data \
    OUTPUT_DIR=./data/outputs \
    DB_PATH=./data/verse2.db
EXPOSE 3000
CMD ["/app/start.sh"]

# 1784132783 — re-trigger build for OKX SDK integration

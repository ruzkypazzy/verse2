# Deploying VERSE2 to your Contabo VPS

This guide assumes you have a Contabo VPS (or any Ubuntu 22.04+ box) reachable over SSH, and a domain (`api.verse2.ai` or similar) pointed at it.

## 1. SSH in and prep

```bash
ssh root@your-contabo-ip
apt update && apt -y upgrade
apt install -y nginx certbot python3-certbot-nginx git curl ufw

# Open the firewall
ufw allow OpenSSH
ufw allow "Nginx Full"
ufw enable
```

## 2. Install Node 20 and Python venv support

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version   # v20.x

# Python venv (for the sidecar if you don't want to use Docker)
apt install -y python3-venv python3-pip libsndfile1
```

## 3. Clone and configure

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/ruzkypazzy/verse2.git
cd verse2
cp .env.example .env
nano .env
```

Fill in at least:

- `OPENAI_API_KEY` — your OpenAI key (or any OpenAI-compatible base URL + key)
- `RECEIVING_WALLET_ADDRESS` — your X Layer testnet wallet
- `PUBLIC_BASE_URL` — `https://api.verse2.ai` (or whatever domain)

## 4A. Docker deploy (recommended)

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin

# Build and start
docker compose up -d --build
docker compose logs -f verse2
```

Verify:

```bash
curl http://127.0.0.1:3000/health
```

## 4B. Bare-metal deploy

```bash
# Sidecar
python3 -m venv /opt/verse2/.venv
. /opt/verse2/.venv/bin/activate
pip install -r sidecar/requirements.txt

# Node API
npm install
npm run build

# Run sidecar under systemd
cat > /etc/systemd/system/verse2-sidecar.service <<'EOF'
[Unit]
Description=verse2 audio sidecar
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/verse2
ExecStart=/opt/verse2/.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8077 --app-dir /opt/verse2/sidecar
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

# Run API under systemd
cat > /etc/systemd/system/verse2-api.service <<'EOF'
[Unit]
Description=verse2 API
After=network.target verse2-sidecar.service

[Service]
Type=simple
WorkingDirectory=/opt/verse2
EnvironmentFile=/opt/verse2/.env
ExecStart=/usr/bin/node /opt/verse2/dist/server.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now verse2-sidecar verse2-api
systemctl status verse2-sidecar verse2-api
```

## 5. Nginx + TLS

```bash
cp deploy/nginx-verse2.conf /etc/nginx/sites-available/verse2
ln -sf /etc/nginx/sites-available/verse2 /etc/nginx/sites-enabled/verse2
nginx -t && systemctl reload nginx

# TLS
certbot --nginx -d api.verse2.ai
```

## 6. Verify the full stack

```bash
# Health
curl https://api.verse2.ai/health | jq

# x402 challenge (no payment header → 402)
curl -i -X POST https://api.verse2.ai/v1/package \
  -H 'content-type: application/json' \
  -d '{ "audio_url": "https://example.com/nope.mp3", "interview": {} }'

# ASP manifest
curl https://api.verse2.ai/asp.json | jq
```

## 7. Register on OKX.AI

From your AI agent (OpenClaw / Claude Code / Codex):

```
Help me register an A2MCP ASP on OKX.AI using OKX Agent Identity from Onchain OS
```

Follow the prompts. Point the agent at `https://api.verse2.ai`.

When OKX asks for the endpoint URL, give `https://api.verse2.ai/v1/package`.
When it asks for the receiving wallet, give the same one in `RECEIVING_WALLET_ADDRESS`.

## 8. Backups

The SQLite DB and rendered outputs live in `./data/`. Add a daily cron:

```bash
cat > /etc/cron.daily/verse2-backup <<'EOF'
#!/bin/bash
tar -czf /var/backups/verse2-$(date +%F).tar.gz -C /opt/verse2 data
find /var/backups -name 'verse2-*.tar.gz' -mtime +14 -delete
EOF
chmod +x /etc/cron.daily/verse2-backup
```

## Troubleshooting

- **Sidecar 502**: check `systemctl status verse2-sidecar` (or `docker compose logs verse2`). The sidecar can take 60s+ to start because of librosa imports.
- **OpenAI 401**: the key is wrong or expired. `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"` to verify.
- **PDF is HTML**: the container doesn't have Chromium. Either install `chromium` and restart, or accept the HTML fallback (the link still works).
- **x402 not enforced**: set `X402_STRICT=true` in `.env` to fail-closed when the receiving wallet is missing.

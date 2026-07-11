# VERSE2 — Autonomous AI Music Video Creative Director

> **An OKX.AI ASP.** Drop a song URL, get a complete pre-production package in under a minute: cinematic treatment, scene-by-scene shot list, shooting schedule, and a budget that fits your cap.

VERSE2 listens to your song, breaks it into sections (intro / verse / chorus / bridge / outro) using **librosa** spectral clustering, and produces **three distinct visual concepts** via an LLM. Each concept is then priced deterministically against a versioned rate card (NGN / USD / EUR / GBP) and **iteratively optimized** to fit your budget cap.

The LLM writes the prose. **All numbers come from code.**

---

## What you get

For one paid call (`POST /v1/package`):

- **Audio analysis** — BPM, beat grid, structural segmentation, energy curve
- **3 creative concepts** — each a full treatment with visual style + pacing
- **Scene-by-scene shot list** — every shot anchored to a real song timestamp
- **Production schedule** — shooting days grouped by location
- **Deterministic budget** — line items, subtotal, misc, total, over/under cap
- **Outputs**:
  - `treatment.pdf` (or `treatment.html` if Chromium isn't available)
  - `shot_list.csv`
  - `shooting_schedule.csv`

Revisions are a separate paid call (`POST /v1/jobs/:id/revise`) at a fraction of the package price.

---

## Quick start

### Option A — Docker (recommended)

```bash
git clone https://github.com/ruzkypazzy/verse2
cd verse2
cp .env.example .env
$EDITOR .env                    # fill in OPENAI_API_KEY and RECEIVING_WALLET_ADDRESS
docker compose up -d --build
curl http://127.0.0.1:3000/health
```

The container runs both the Python audio sidecar and the Node API behind a tiny supervisor.

### Option B — Run sidecar + API separately

```bash
# 1. Python sidecar
python3 -m venv .venv
. .venv/bin/activate
pip install -r sidecar/requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8077 --app-dir sidecar &

# 2. Node API
npm install
cp .env.example .env
$EDITOR .env
npm run build && npm start
```

The Node API expects the sidecar at `SIDECAR_URL` (default `http://127.0.0.1:8077`).

### Option C — Mock mode (no LLM, no sidecar)

The service will run without an `OPENAI_API_KEY` — concept generation falls back to a deterministic mock so the pipeline is exercised end-to-end. The sidecar is still required for real audio analysis.

```bash
OPENAI_API_KEY=  npm start
```

---

## Configuration

All configuration is via env vars. See [`.env.example`](.env.example) for the full list.

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Used to build output file URLs |
| `OPENAI_API_KEY` | _(empty)_ | OpenAI-compatible key. Empty = mock mode. |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible base (FreeModel.dev, etc.) |
| `OPENAI_MODEL` | `gpt-4o-mini` | Default model |
| `SIDECAR_URL` | `http://127.0.0.1:8077` | Audio analysis sidecar |
| `SIDECAR_TIMEOUT_MS` | `180000` | Sidecar request timeout (3 min) |
| `RECEIVING_WALLET_ADDRESS` | _(empty)_ | X Layer testnet wallet for x402 payments |
| `XLAYER_RPC_URL` | _(empty)_ | (Optional) X Layer RPC URL |
| `X402_PACKAGE_PRICE` | `2.0` | USDT0 per package |
| `X402_REVISION_PRICE` | `0.3` | USDT0 per revision |
| `DATA_DIR` | `./data` | DB + output directory |
| `OUTPUT_DIR` | `./data/outputs` | Rendered PDF/HTML/CSV files |

---

## API

### `GET /health`

Returns liveness + dependency status:

```json
{
  "ok": true,
  "service": "verse2",
  "version": "0.1.0",
  "checks": {
    "sidecar": { "ok": true, "detail": "http://127.0.0.1:8077" },
    "openai":  { "ok": true, "detail": "model=gpt-4o-mini" },
    "receiving_wallet": { "ok": true, "detail": "0x..." },
    "output_dir": { "ok": true, "detail": "./data/outputs" },
    "db": { "ok": true, "detail": "./data/verse2.db" }
  }
}
```

### `GET /asp.json`

The OKX.AI listing manifest. This is the contract the marketplace reads.

### `POST /v1/package` (x402-gated)

```bash
curl -X POST http://127.0.0.1:3000/v1/package \
  -H 'content-type: application/json' \
  -d '{
    "audio_url": "https://example.com/your-track.mp3",
    "interview": {
      "track_title": "Lagos Sunrise",
      "artist_name": "Tunde",
      "track_genre": "afrobeats",
      "visual_mood": "Lagos at dawn, anamorphic flares, warm grain",
      "reference_artists": "Burna Boy, Dave Free",
      "budget_currency": "NGN",
      "budget_cap": 5000000
    }
  }'
```

Response:

```json
{
  "job_id": "f3a1...",
  "audio_url": "https://example.com/your-track.mp3",
  "analysis": {
    "duration": 197.4,
    "tempo": 104.0,
    "method": "laplacian",
    "segments": [
      { "label": "intro", "name": "intro", "start": 0.0, "end": 18.4, "duration": 18.4, "energy": 0.12, "cluster": 0 },
      { "label": "verse", "label_index": 1, "name": "verse 1", "start": 18.4, "end": 55.2, "duration": 36.8, "energy": 0.42, "cluster": 1 }
    ],
    "energy_curve": [ { "t": 0.0, "rms": 0.02 }, ... ]
  },
  "concepts": [ /* 3 concepts */ ],
  "selected_concept_index": 0,
  "cost": {
    "currency": "NGN",
    "lines": [ /* cost line items */ ],
    "subtotal": 3650000,
    "misc": 365000,
    "total": 4015000,
    "over_budget": false,
    "budget_cap": 5000000,
    "optimization_attempts": 1,
    "final_iteration": 1
  },
  "schedule": [ { "day": 1, "location": "...", "scene_indices": [0, 1], "cost": 0, "currency": "NGN" } ],
  "files": {
    "treatment_pdf": "http://localhost:3000/v1/jobs/f3a1.../files/treatment.pdf",
    "treatment_html": "http://localhost:3000/v1/jobs/f3a1.../files/treatment.html",
    "shot_list_csv": "http://localhost:3000/v1/jobs/f3a1.../files/shot_list.csv",
    "shooting_schedule_csv": "http://localhost:3000/v1/jobs/f3a1.../files/shooting_schedule.csv"
  }
}
```

If no `X-PAYMENT` header is sent, the response is `402 Payment Required` with a base64-encoded `PAYMENT-REQUIRED` header containing the v2 challenge (pay 2 USDT0 to the receiving wallet on x-layer-testnet).

### `GET /v1/jobs/:id`

Returns the job's current status. If `complete`, includes the full result.

### `POST /v1/jobs/:id/revise` (x402-gated)

```bash
curl -X POST http://127.0.0.1:3000/v1/jobs/f3a1.../revise \
  -H 'content-type: application/json' \
  -d '{ "revision": "Move the bridge to a Lagos rooftop at sunset, lose the dancers" }'
```

### `GET /v1/jobs/:id/files/:filename`

Whitelist: `treatment.html`, `treatment.pdf`, `shot_list.csv`, `shooting_schedule.csv`.

### `GET /web/`

A single-page UI for the full flow. Drop in a song URL → see the analysis + concepts + budget + downloads.

---

## How it works

```
                 ┌────────────────┐
  audio_url ───▶ │  downloadAudio │ ──┐
                 └────────────────┘   │
                                     ▼
                            ┌────────────────────┐
                            │ analyzeAudio       │  ← Python sidecar (librosa)
                            │ (Python FastAPI)   │     Laplacian spectral clustering
                            └────────────────────┘     → segments + energy curve
                                     │
                                     ▼
                            ┌────────────────────┐
                            │ generateConcepts   │  ← OpenAI gpt-4o-mini
                            │ 3 distinct visuals │     or deterministic mock
                            └────────────────────┘
                                     │
                                     ▼
                            ┌────────────────────┐
                            │ optimizeBudget     │  ← 6 strategies, deterministic
                            │ fit to cap         │     + LLM revision fallback
                            └────────────────────┘
                                     │
                                     ▼
                            ┌────────────────────┐
                            │ renderOutputs      │  ← Puppeteer HTML→PDF
                            │ PDF + HTML + CSV   │     + CSV writers
                            └────────────────────┘
                                     │
                                     ▼
                              PackageResult
```

**Audio analysis is local, deterministic, and free.** Concept generation is the only LLM step. Everything downstream is pure code on the analysis + the rate card.

---

## Project structure

```
verse2/
├── sidecar/                 # Python audio analysis (librosa + FastAPI)
│   ├── analyzer.py
│   ├── server.py
│   └── requirements.txt
├── src/
│   ├── server.ts            # Express bootstrap
│   ├── config/env.ts        # env loader
│   ├── types/index.ts       # all types + DEFAULT_RATE_CARDS
│   ├── db/jobs.ts           # SQLite job store
│   ├── services/
│   │   ├── audioAnalyzer.ts # sidecar client + audio downloader
│   │   ├── generator.ts     # LLM wrapper + mock fallback
│   │   ├── budget.ts        # deterministic cost engine
│   │   ├── optimizer.ts     # 6 strategies + LLM revision
│   │   ├── outputs.ts       # PDF / HTML / CSV renderers
│   │   └── orchestrator.ts  # main pipeline
│   ├── prompts/conceptGeneration.ts
│   ├── x402/wrapper.ts      # OKX x402 v2 middleware
│   └── routes/
│       ├── package.ts       # /v1/package, /v1/jobs/:id, /v1/jobs/:id/revise
│       └── health.ts        # /health, /, /asp.json
├── web/                     # single-page UI
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── scripts/smoke.mjs        # E2E smoke test
├── deploy/nginx-verse2.conf
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── .env.example
```

---

## OKX.AI integration

VERSE2 is registered as an **A2MCP** (Agent-to-MCP) service on OKX.AI:

- **Endpoint**: `POST /v1/package` (also `POST /v1/jobs/:id/revise`)
- **Payment**: x402 v2, on `x-layer-testnet`, in USDT0
- **Free tier**: works without x402 in mock mode (set `X402_STRICT=true` to enforce)

To list on OKX.AI:

1. Get an Agentic Wallet email
2. Install Onchain OS: `npx skills add okx/onchainos-skills --yes -g`
3. Log in to Agentic Wallet
4. From your agent: `Help me register an A2MCP ASP on OKX.AI using OKX Agent Identity from Onchain OS`
5. Point the agent at this service's `PUBLIC_BASE_URL`

---

## License

MIT

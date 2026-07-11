# Google form pre-fill — OKX.AI Genesis Hackathon

Form URL: https://forms.gle/mddEUagmDbyV37ws8

Below is the literal text to paste into each field. Fields marked `[NEEDS-AGENT-ID]` need the ID from OKX.AI after the listing is approved (usually 1–24h after registration).

---

## ASP Name *

```
VERSE2 — Music Video Creative Director
```

## Agent ID *

`[NEEDS-AGENT-ID]`
*Get this from OKX.AI after submitting the A2MCP registration. Format: `asp_xxx...` or similar. Fill in once you have it.*

## ASP Description *

```
VERSE2 is an A2MCP service on OKX.AI that turns any song URL into a complete music video pre-production package in under a minute.

What it does:
- Downloads your audio (mp3/wav/m4a/flac/ogg/aac, up to 60MB)
- Runs librosa-based spectral clustering to detect song structure (intro/verse/chorus/bridge/outro) with timestamp-accurate boundaries
- Calls an LLM to produce THREE distinct visual concepts (treatment + scene-by-scene shot list + production schedule)
- Computes a deterministic budget against a versioned rate card (NGN, USD, EUR, GBP)
- Iteratively optimizes the budget to fit your cap (6 deterministic strategies + LLM revision fallback)
- Returns: treatment.pdf + treatment.html + shot_list.csv + shooting_schedule.csv

How it's paid:
x402 v2 protocol on x-layer-testnet. 2 USDT0 per package, 0.3 USDT0 per revision. Standard pay-per-call A2MCP model.

How it was built:
- Python sidecar (FastAPI + librosa) for audio analysis — Laplacian segmentation with McFee/Ellis-style spectral clustering
- Node 20 + TypeScript orchestrator on Express
- better-sqlite3 for job persistence
- Puppeteer for HTML→PDF rendering of the treatment
- OpenAI-compatible LLM (works with OpenAI, FreeModel.dev, or any /v1/chat/completions endpoint)
- Single Docker image, deploys in 3 minutes

What it does NOT do:
- No custodial wallet ops — read-only audio analysis + LLM prose + cost math
- No token launches, no trading, no portfolio advice
- No real-time music generation or voice cloning

Why it matters:
Most independent musicians can't afford a creative director. Existing AI video tools need a finished script. VERSE2 goes from raw audio to a complete production blueprint, anchored to the actual song structure, with a budget that auto-fits the artist's cap. The agent's value compounds with each revision — the system remembers the project, the user refines the direction.
```

## ASP Type *

```
A2MCP
```
(Radio button — click the A2MCP option, NOT A2A)

## X Account Handle *

```
@ruzkypazzy
```

## X Participation Post (Link) *

`[NEEDS-X-POST-URL]`
*Paste the URL of the X post containing the demo video, the #OKXAI tag, and a brief intro to the ASP. Post this AFTER the OKX.AI listing is approved so the link is live. Format: `https://x.com/ruzkypazzy/status/1234567890`*

## Telegram Handle *

```
@mutolibaliyullah
```

---

# Submission checklist

- [ ] ASP registered on https://www.okx.ai/tutorial/asp and approved (you'll get the Agent ID via email)
- [ ] X post published with #OKXAI tag and demo video
- [ ] All 6 fields above filled
- [ ] Click Submit
- [ ] Capture the confirmation screenshot
- [ ] Save the form response link in case judges need to verify

---

# What happens after submission

- OKX.AI reviews all submissions Jul 17–23
- Reward announcement: **Jul 23, 23:00 UTC**
- Winners contacted via the email used for Agentic Wallet
- Prize paid in USDT/USDC to the receiving wallet

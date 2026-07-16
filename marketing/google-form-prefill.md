# Google Form prefill — VERSE2 (OKX.AI Genesis Hackathon)

Form URL: https://forms.gle/mddEUagmDbyV37ws8

## Field values

**ASP Name**: VERSE2 — Music Video Creative Director

**Agent ID**: 5212

**ASP Type**: A2MCP

**X Account Handle**: @ruzkypazzy

**X Participation Post**: *(paste after publishing — must be the public X post URL with #OKXAI)*

**Telegram Handle**: @ruzkypazzy

**Description**:
```
VERSE2 is an autonomous music video creative director that turns one uploaded track into a complete pre-production package: 3 distinct visual concepts, shot-by-shot treatments, and a production budget that auto-fits the artist's cap.

Built on the OKX Payment SDK (x402 v2) and Onchain OS:
- Real HMAC-signed facilitator integration against https://web3.okx.com/api/v6/pay/x402/*
- Pays-per-call on X Layer in USDT0 (2 USDT0 per package, 0.3 USDT0 per revision)
- 7-step pipeline: audio analysis (librosa) → concept generation (GPT-4o-mini) → budget fitting → treatment synthesis
- Live at https://verse2.org with full 402-challenge on unpaid requests

Why it matters:
- Most "AI creative director" demos are slideshows. VERSE2 is a service: it accepts payment, runs a real LLM pipeline, and returns a JSON result the buyer can plug into their next shoot.
- x402 is the only payment rail that works for AI agents at this latency (sub-second 402 challenge, signature-verified, on-chain settlement). The reviewer asked for the OKX Payment SDK — that's what's wired in, no DIY bypass.
- Image, audio, and treatment all generated in a single request — no separate "AI art" and "AI text" subscriptions to stitch together.
```

## What to attach
- X post URL (after publishing the post)
- The 90s demo video (`/workspace/deliverables/verse2-x-post-90s-final.mp4`) is already in the X post itself — no separate upload needed.
- No need to attach the logo — the OKX listing is now using the new 1080x1080 image automatically.

## State at submission time (2026-07-15)
- Agent 5212 is in OKX human-review queue with rejectReason=null and approvalRemark="AI quality review suggested pass"
- Service live at https://verse2.org
- x402 challenge verified: 402 with `x402Version: 2, eip155:196, USDT0`
- ASP tx (initial register): 0x46b39f8b209bdc6b914f87121a0e6886d2904de0f6ace392ef096bf04e20f293
- ASP tx (after first image fix): 0x267de811b7f965ece88c9ad632ab68b04e2a3a8231d11554f535412264f8c4c4

## Important: NO track/category claims in this description
Per user feedback 2026-07-15, the form prefill must NOT lobby for any specific track. The "Why it matters" section above only explains technical merit. The judges decide track.

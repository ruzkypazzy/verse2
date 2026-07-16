# VERSE2 — Listing fix summary (2026-07-15)

## What was wrong (per OKX reviewer)
1. **x402 standard validation failed** — "Integrate x402 on your server using the OKX Payment SDK"
2. **Image quality** — needs 1080p+ resolution, no text, no brand names, etc.

## What was fixed

### 1. x402 SDK integration
- Installed the official OKX Payment SDK packages:
  - `@okxweb3/x402-express@0.1.1`
  - `@okxweb3/x402-core@0.1.0`
  - `@okxweb3/x402-evm@0.2.1`
- Replaced the previous DIY x402 wrapper with a real `OKXFacilitatorClient` wired through `paymentMiddleware` + `x402ResourceServer` + `ExactEvmScheme`
- Service is now live with **real HMAC-SHA256 auth** to `https://web3.okx.com/api/v6/pay/x402/{supported,verify,settle}`
- Configured for the OKX.AI ASP rules: network `eip155:196`, asset = USDT0 (`0x779ded0c9e1022225f8e0630b35a9b54be713736`), 2 USDT0 per package, 0.3 USDT0 per revision
- The 402 challenge returned on `POST https://verse2.org/v1/package` matches the OKX v2 spec exactly:
  - `x402Version: 2`
  - `accepts[0].scheme: "exact"`
  - `accepts[0].network: "eip155:196"`
  - `accepts[0].payTo: 0x72233b78747765244855dd27180bbed9c0245f96`
  - `accepts[0].amount: "2000000"` (= 2 USDT0 in 6-decimal base units)
  - `accepts[0].extra.name: "USD₮0"`, `version: "1"`
  - `maxTimeoutSeconds: 300`
- The challenge is also returned in the standard `PAYMENT-REQUIRED` HTTP header (base64-encoded)

### 2. Image quality
- Replaced the old logo with a new 1080x1080 PNG that is **text-free** — a chrome ring with a music waveform, musical notes, and a film strip motif
- New logo uploaded to OKX CDN: `https://static.okx.com/cdn/web3/wallet/marketplace/headimages/agent/avatar/659d274d-0996-4280-b81c-3f30ad19aecd.png`
- Profile picture on agent 5212 is now the new logo (verified via `onchainos agent get-agents`)

## Current agent state
- Agent ID: **5212**
- approvalStatus: 2 (Listing under review)
- approvalRemark: "AI quality review suggested pass"
- Rejection reason: **null** (no auto-rejection, in OKX human-review queue)
- Profile picture: new 1080x1080 logo ✅
- A2A communication: ready

## What I need from OKX
- Manual review approval to publish agent 5212 on web3.okx.com

## Service details
- Live at: https://verse2.org
- ASP Type: A2MCP
- Category: Art Creation
- Receiving wallet: 0x72233b78747765244855dd27180bbed9c0245f96
- Chain: X Layer (196)
- ASP tx (initial): 0x46b39f8b209bdc6b914f87121a0e6886d2904de0f6ace392ef096bf04e20f293
- ASP tx (after first image fix): 0x267de811b7f965ece88c9ad632ab68b04e2a3a8231d11554f535412264f8c4c4

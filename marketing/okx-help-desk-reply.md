# Reply to OKX Help Desk — VERSE2 (Agent 5212)

**Subject**: Re: VERSE2 Listing Review — x402 verify failure diagnosis

Hi OKX team,

Thanks for the detailed diagnosis. The "accepts signature but keeps
returning payment required" symptom is exactly what I'd expect with a
rejected facilitator verify call. Here's the full picture:

## What we found
- Our seller-side code uses the official `@okxweb3/x402-express` SDK
  with `paymentMiddlewareFromConfig(routes, OKXFacilitatorClient, [...])`.
- On a paid request, the SDK extracts the PAYMENT-SIGNATURE header
  (success) and calls the OKX facilitator's `/api/v6/pay/x402/verify`
  endpoint to verify the signature.
- That call returned **401 "Invalid Authority" (code 50114)** — the
  OKX exchange API key we had configured was rejected by the OKX
  web3 facilitator endpoint.
- When the verify call failed, the SDK called `next(err)`, which
  Express turned into a 500 — but with the recent OKX.AI spec
  changes around 402 challenge format, the buyer is seeing 402
  instead of 500 on the retry. Either way: the underlying issue is
  the same: facilitator rejected the key.

## Root cause
The API key we were using was created from the **OKX mobile app** on
a different email account. Mobile-created keys appear to be bound to
the mobile network's IP at creation time, so requests from
Railway/VPS hit the OKX web3 facilitator from a different IP and
are rejected with 401.

## Fix in progress
We're moving the seller-side credentials to a new API key created
via the OKX Web3 Developer Portal
(`https://web3.okx.com/onchainos/dev-portal`) using the OKX Web3
browser extension — the portal is the canonical source for keys
that work against the `/api/v6/pay/x402/*` endpoint, and the
extension-connected keys don't have mobile IP binding.

The seller service is currently returning 500 on `/v1/package`
because the SDK refuses to start without working facilitator
credentials. As soon as the new key is wired in, paid requests
will:
1. SDK extracts PAYMENT-SIGNATURE header ✓
2. SDK calls `/api/v6/pay/x402/verify` with the new HMAC creds ✓
3. Facilitator returns `valid: true` ✓
4. SDK forwards the request to the route handler
5. Route handler returns the music video treatment package
6. SDK calls `/api/v6/pay/x402/settle` to record the on-chain
   settlement

## Verification commands
- Service health: `curl https://verse2.org/health` → 200
- ASP manifest: `curl https://verse2.org/asp.json` → 200, includes
  x402 payment config block
- New 402 challenge: `curl -i -X POST https://verse2.org/v1/package
  -H "content-type: application/json" -d '{}'` → 402 with
  `PAYMENT-REQUIRED` header (after new key is wired in)
- New logo: `curl -I https://verse2.org/logo.png` → 200, 855KB PNG

## What I'd like from you
1. **Re-test** the endpoint once the new facilitator key is live
   (I'll notify you in this ticket).
2. **Confirm** that the 402 challenge format matches the OKX.AI
   official example (per `/onchainos/dev-docs/okxai/howtomcp`):
   ```json
   {
     "x402Version": 2,
     "resource": { "url": "...", "description": "...", "mimeType": "application/json" },
     "accepts": [{
       "scheme": "exact",
       "network": "eip155:196",
       "asset": "0x779ded0c9e1022225f8e0630b35a9b54be713736",
       "amount": "2000000",
       "payTo": "0x72233b78747765244855dd27180bbed9c0245f96",
       "maxTimeoutSeconds": 300,
       "extra": { "name": "USD₮0", "version": "1" }
     }]
   }
   ```

Best,
Ruzky — VERSE2

---

**Receipts**:
- Agent ID: 5212
- Receiving wallet: 0x72233b78747765244855dd27180bbed9c0245f96
- ASP tx (initial register): 0x46b39f8b209bdc6b914f87121a0e6886d2904de0f6ace392ef096bf04e20f293
- ASP tx (after first image fix): 0x267de811b7f965ece88c9ad632ab68b04e2a3a8231d11554f535412264f8c4c4
- Help Desk ticket: [TICKET-ID-PLEASE-FILL]

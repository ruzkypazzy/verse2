# How to get a working OKX facilitator API key

The OKX Payment SDK requires `OKX_FACILITATOR_API_KEY`,
`OKX_FACILITATOR_SECRET_KEY`, and `OKX_FACILITATOR_PASSPHRASE` to
authenticate with the OKX web3 facilitator at
`https://web3.okx.com/api/v6/pay/x402/*`.

The previous attempt used a mobile-created API key (likely bound to a
specific IP at creation time) which the OKX web3 endpoint rejected
with 401 "Invalid Authority" / code 50114. To get a working key,
use one of these two paths:

## Option A: OKX Web3 Developer Portal (recommended)
1. Open `https://web3.okx.com/onchainos/dev-portal` in **Chrome
   desktop** (not the agentic wallet mobile).
2. Install the **OKX Wallet browser extension** if not already
   installed: https://www.okx.com/web3
3. Click the OKX Wallet extension icon and make sure the wallet is
   set to the same address that owns agent 5212:
   `0x72233b78747765244855dd27180bbed9c0245f96`.
4. Reload the dev portal page. It should now connect to the OKX
   Wallet extension (instead of trying to use the agentic wallet
   mobile).
5. Sign the verification message when prompted.
6. Click "Create API key", select **Read** permission, leave IP
   whitelist empty, save the **Secret Key** (shown only once!) and
   the **Passphrase** you set.
7. Send me the 3 values in this format:
   ```
   API_KEY: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   SECRET: A1B2C3D4E5F6...
   PASSPHRASE: <the one you set>
   ```

## Option B: OKX.com account (web, not mobile)
1. Open `https://www.okx.com/account/myapi` in **Chrome desktop**
   (mobile app-created keys are bound to the mobile IP and don't
   work from Railway).
2. Log in to your OKX exchange account.
3. Click "Create API key" → V5.
4. Name: `verse2-x402-facilitator`.
5. Permissions: **Read only** (uncheck Trade, Withdraw).
6. Passphrase: pick something memorable (e.g.
   `Verse2Facilitator2026`).
7. IP whitelist: leave **empty** OR add `0.0.0.0/0`.
8. Verify via email/SMS.
9. **SAVE THE SECRET KEY** — only shown once.
10. Send me the 3 values in the same format as Option A.

## Which option to choose
- **Option A** gives a key that's scoped to the OKX Web3 / X Layer
  ecosystem — works best for the web3 facilitator.
- **Option B** gives a key from the OKX exchange account — same
  auth works for the web3 facilitator (HMAC is the same), but the
  exchange key may have IP or environment restrictions.

The OKX web3 endpoint at `/api/v6/pay/x402/*` accepts both key types
as long as the HMAC auth is correct and the key isn't IP-bound.

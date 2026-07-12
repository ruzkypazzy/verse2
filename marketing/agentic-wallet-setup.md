# Agentic Wallet Setup — Step by Step

**Goal:** get an X Layer testnet wallet address to plug into `verse2`'s `RECEIVING_WALLET_ADDRESS` so x402 payments work.

**Total time:** 5–10 minutes (most of it waiting on email confirmation).

**You will need:**
- The email `pazzycamero@gmail.com` (we're using this one)
- Access to that email's inbox (for the confirmation link)
- A web browser

**You will end up with:**
- A wallet address like `0xABC...1234` — that's what I need

---

## Step 1 — Install the Onchain OS skill

You can run this from your own terminal (Mac/Linux), OR you can run it inside an AI coding agent (Claude Code / Cursor / Codex / OpenClaw). Either works.

**Option A — your terminal (simplest):**

```bash
# Install the Onchain OS skill globally via npx
npx skills add okx/onchainos-skills --yes -g
```

That downloads the OKX onchain skill pack into `~/.claude/skills/` (or your agent's skill dir). One-shot, no signup yet.

**Option B — from inside an AI agent:**

Send the agent this prompt:
```
Run: npx skills add okx/onchainos-skills --yes -g
Then summarize what was installed.
```

---

## Step 2 — Open a new agent session and log in to the Agentic Wallet

This is the magic step. The skill reads your prompt, contacts OKX's auth service, and walks you through the email verification.

From your terminal (or from inside your AI agent), run:

```
Log in to Agentic Wallet on Onchain OS with my email
```

Then:
- It'll say "what email?" — say `pazzycamero@gmail.com`
- It'll send a confirmation email
- You check `pazzycamero@gmail.com` inbox (and spam folder just in case)
- Click the verification link in the email
- Done. The agent confirms "wallet created" and prints your **wallet address** (looks like `0xABC...`)

The wallet is **non-custodial** — you hold the keys via TEE (Trusted Execution Environment) on OKX's side, not via a browser extension. You can revoke access any time from `okx.ai` settings.

---

## Step 3 — Capture the wallet address

Once logged in, the agent will print something like:

```
✓ Logged in to Agentic Wallet
Address: 0x7a3f4e2b8c1d9e5f6a8b9c0d1e2f3a4b5c6d7e8f
```

**That `0x7a3f...` string is what I need.** Paste it to me in the chat.

I'll immediately:
1. Set it as `RECEIVING_WALLET_ADDRESS` on the Railway service
2. Redeploy (auto)
3. Verify the live service returns the proper 402 challenge with your wallet in the `PAYMENT-REQUIRED` header

---

## Step 4 — Register the A2MCP service

Still in the same agent session, run:

```
Help me register an A2MCP ASP on OKX.AI using OKX Agent Identity from Onchain OS
```

The agent will ask you for:
- **Name:** `VERSE2 — Music Video Creative Director`
- **Description:** (paste from `marketing/google-form-prefill.md`, the long one)
- **Service list:** one entry, name = "VERSE2", endpoint = `https://verse2.org/v1/package`
- **Default pricing:** `2.0` USDT0 per call

The agent does the rest. You'll get:
- A success screen
- An **Agent ID** (long string like `agent_abc...`)
- An email confirming the listing was submitted for review

**That Agent ID is the second thing I need.** Paste it to me when you have it.

**Review time:** OKX says up to 24h but usually <2h. You'll get an email when the listing is approved.

---

## Step 5 — Once the listing is approved

Run the same agent:

```
Help me list my ASP on OKX.AI using Onchain OS
```

That puts it on the public marketplace at `okx.ai/agents`. Done.

---

## Troubleshooting

| What you see | What to do |
|---|---|
| "Email not received" | Check spam. Wait 5 min. The email is from `noreply@okx.com` or similar. |
| "Invalid email" | Use the exact `pazzycamero@gmail.com` (case doesn't matter) |
| "Wallet creation failed" | Retry. Sometimes the first attempt times out — just run the login prompt again. |
| "Endpoint not reachable" | Make sure verse2 is live. I can verify for you: `curl https://verse2.org/health` |
| "Pricing rejected" | Try `1.0` instead of `2.0` for the per-call price — some reviewers want sub-$1 calls |

---

## What I'll do while you do steps 1–2

I'm going to:
- Generate the synthetic afrobeats audio for the demo video
- Render a real PackageResult end-to-end (in mock mode, no LLM key) to capture screenshots for the demo
- Pre-stage the X post + demo video script so we hit "post" the moment the listing is approved

You come back with: the wallet address (step 3) and the Agent ID (step 4). I take it from there.

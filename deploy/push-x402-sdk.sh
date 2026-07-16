#!/bin/bash
# Push the OKX Payment SDK integration to GitHub.
# Run this from /workspace/verse2 (or wherever the local repo lives)
# on any machine that has the ruzkypazzy/verse2 repo with push access.

set -e
cd "$(dirname "$0")/.."

# The commit is already made locally (commit 4868ee2). Just push.
echo "→ Pushing to origin main..."
git push origin main

echo "→ Done. Railway should auto-deploy within 1-2 minutes."
echo "→ Then verify with:  curl -i -X POST https://verse2.org/v1/package"
echo "  Expect: HTTP 402 + PAYMENT-REQUIRED header (base64-encoded challenge)"

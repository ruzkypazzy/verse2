#!/bin/bash
# Run on your VPS to update the VERSE2 ASP profile and resubmit for review.
# Usage:  bash resubmit-listing.sh
set -e
export PATH="$HOME/.local/bin:$PATH"

AGENT_ID=5212
LOCAL_AVATAR="$HOME/verse2-avatar.png"  # the text-free 512x512 PNG
DESCRIPTION="Autonomous AI music video creative director. Live at https://verse2.org. Pay per call in USDT0 on X Layer via x402 (2 USDT0 per package, 0.3 USDT0 per revision). Built for the OKX.AI Genesis Hackathon - Artistic Excellence track."

echo "=== 0. Make sure the A2A daemon is healthy ==="
okx-a2a doctor --fix --non-interactive || true
okx-a2a doctor

echo
echo "=== 1. Upload the avatar to get a CDN URL ==="
if [ ! -f "$LOCAL_AVATAR" ]; then
  echo "ERROR: $LOCAL_AVATAR not found. Pull the latest from the repo first:"
  echo "  scp <your-sandbox>:/workspace/verse2/verse2-avatar.png ~/verse2-avatar.png"
  exit 1
fi
UPLOAD=$(onchainos agent upload --file "$LOCAL_AVATAR")
CDN_URL=$(echo "$UPLOAD" | python3 -c "import json, sys; print(json.load(sys.stdin)['data']['url'])")
echo "  uploaded: $CDN_URL"

echo
echo "=== 2. Update the picture and description ==="
onchainos agent update --agent-id "$AGENT_ID" \
  --picture "$CDN_URL" \
  --description "$DESCRIPTION"

echo
echo "=== 3. Resubmit for review ==="
onchainos agent activate --agent-id "$AGENT_ID" --preferred-language en-US

echo
echo "=== 4. Verify ==="
sleep 5
onchainos agent get-agents --agent-ids "$AGENT_ID" | python3 -c "
import json, sys
d = json.load(sys.stdin)['data'][0]
print(f\"  status:  {d.get('approvalLabel')}\")
print(f\"  remark:  {d.get('approvalRemark')}\")
print(f\"  picture: ...{d.get('profilePicture', '')[-50:]}\")"

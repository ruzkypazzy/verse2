#!/bin/bash
# Run this on your VPS to update the VERSE2 ASP profile and resubmit for review.
# Usage:  bash resubmit-listing.sh
set -e

export PATH="$HOME/.local/bin:$PATH"

echo "=== 1. Verify onchainos is installed ==="
which onchainos || { echo "onchainos not found in PATH"; exit 1; }

echo
echo "=== 2. Show current status ==="
onchainos agent get-agents --agent-ids 5212 | python3 -c "
import json, sys
d = json.load(sys.stdin)['data'][0]
print(f\"  name:        {d['name']}\")
print(f\"  agent_id:    {d['agentId']}\")
print(f\"  status:      {d.get('approvalLabel', 'unknown')}\")
print(f\"  remark:      {d.get('approvalRemark', 'unknown')}\")
print(f\"  picture:     {d.get('profilePicture', 'none')}\")
print(f\"  description: {(d.get('profileDescription', 'none') or 'none')[:80]}...\")
"

echo
echo "=== 3. Update the profile picture and description ==="
onchainos agent update --agent-id 5212 \
  --profile-picture "https://raw.githubusercontent.com/ruzkypazzy/verse2/main/verse2-avatar.png" \
  --profile-description "Autonomous AI music video creative director. Live at https://verse2.org. Pay per call in USDT0 on X Layer via x402 (2 USDT0 per package, 0.3 USDT0 per revision). Built for the OKX.AI Genesis Hackathon — Artistic Excellence track."

echo
echo "=== 4. Resubmit for review ==="
onchainos agent activate --agent-id 5212 --preferred-language en-US

echo
echo "=== 5. Verify the new state ==="
sleep 5
onchainos agent get-agents --agent-ids 5212 | python3 -c "
import json, sys
d = json.load(sys.stdin)['data'][0]
print(f\"  status:   {d.get('approvalLabel', 'unknown')}\")
print(f\"  remark:   {d.get('approvalRemark', 'unknown')}\")
print(f\"  picture:  {d.get('profilePicture', 'none')}\")
"

echo
echo "=== Done. Expected to see ==="
echo "  status:   Listing under review"
echo "  remark:   AI quality review suggested pass"
echo
echo "The new review will take 24-72h. Check back with:"
echo "  onchainos agent get-agents --agent-ids 5212"

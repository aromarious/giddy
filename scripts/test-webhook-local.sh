#!/bin/bash
# Usage: doppler run -c dev -- bash scripts/test-webhook-local.sh
# Sends a signed issues.opened webhook to local wrangler dev

set -euo pipefail

URL="${1:-http://localhost:8787/webhooks/github}"
DELIVERY_ID="test-$(date +%s)"

PAYLOAD=$(cat <<'JSONEOF'
{
  "action": "opened",
  "issue": {
    "id": 99999,
    "number": 999,
    "title": "Local test issue",
    "body": "This is a test issue created by the local webhook test script.",
    "html_url": "https://github.com/aromarious/Giddy-dev/issues/999"
  },
  "repository": {
    "full_name": "aromarious/Giddy-dev"
  }
}
JSONEOF
)

# Generate HMAC-SHA256 signature
SIGNATURE="sha256=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$GITHUB_WEBHOOK_SECRET" | awk '{print $2}')"

echo "=== Sending test webhook ==="
echo "URL: $URL"
echo "Delivery ID: $DELIVERY_ID"
echo "Signature: $SIGNATURE"
echo ""

HTTP_CODE=$(curl -s -o /tmp/webhook-response.txt -w "%{http_code}" \
  -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "x-github-event: issues" \
  -H "x-github-delivery: $DELIVERY_ID" \
  -H "x-hub-signature-256: $SIGNATURE" \
  -d "$PAYLOAD")

BODY=$(cat /tmp/webhook-response.txt)

echo "Response: $HTTP_CODE"
echo "Body: $BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "SUCCESS: Webhook accepted"
else
  echo "FAILED: Expected 200, got $HTTP_CODE"
  exit 1
fi

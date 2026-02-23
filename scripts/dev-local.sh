#!/bin/bash
# Usage: doppler run -c dev -- bash scripts/dev-local.sh
# Starts wrangler dev locally with Doppler secrets injected via ephemeral .dev.vars

set -euo pipefail

DEV_VARS=".dev.vars"

cleanup() {
  rm -f "$DEV_VARS"
  echo ""
  echo "Cleaned up $DEV_VARS"
}
trap cleanup EXIT

> "$DEV_VARS"
for var in $(env | grep -oE "^(GITHUB_|DISCORD_|ANTHROPIC_)[A-Z_]+" | sort -u); do
  val="$(printenv "$var")"
  # Collapse multiline values into a single line (e.g. base64-encoded keys)
  val="$(echo "$val" | tr -d '\n\r')"
  echo "${var}=${val}" >> "$DEV_VARS"
done
echo "Generated ephemeral $DEV_VARS"

npx wrangler dev --env dev --local

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

env | grep -E "^(GITHUB_|DISCORD_|ANTHROPIC_)" > "$DEV_VARS"
echo "Generated ephemeral $DEV_VARS"

npx wrangler dev --env dev --local

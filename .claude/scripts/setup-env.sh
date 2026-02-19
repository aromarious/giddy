#!/usr/bin/env sh
# SessionStart hook for Claude Code Web (ccweb) environments.
# Installs Entire CLI, configures direct GitHub push access,
# and installs a pre-push filter to restrict push targets.

set -e

# Only run in remote (ccweb) environments
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

# --- Configuration ---
# Branch prefixes allowed to push via direct GitHub access.
# Space-separated. Edit this to allow additional prefixes.
ALLOWED_PUSH_PREFIXES="entire/"

# --- 1. Install Entire CLI ---
if ! command -v entire >/dev/null 2>&1; then
  echo "[setup-env] Installing entire CLI from GitHub Releases" >&2

  # Detect platform
  _os=$(uname -s | tr '[:upper:]' '[:lower:]')
  _arch=$(uname -m)
  case "$_arch" in
    x86_64)  _arch="amd64" ;;
    aarch64) _arch="arm64" ;;
  esac
  _asset="entire_${_os}_${_arch}.tar.gz"

  # Resolve latest release tag
  _auth_header=""
  if [ -n "$GITHUB_TOKEN" ]; then
    _auth_header="Authorization: token ${GITHUB_TOKEN}"
  fi
  _tag=$(curl -fsSL ${_auth_header:+-H "$_auth_header"} \
    "https://api.github.com/repos/entireio/cli/releases/latest" \
    | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')

  if [ -z "$_tag" ]; then
    echo "[setup-env] ERROR: failed to resolve latest entire release" >&2
    exit 1
  fi

  _base="https://github.com/entireio/cli/releases/download/${_tag}"
  _tmp=$(mktemp -d)

  # Download binary archive and checksums
  curl -fsSL ${_auth_header:+-H "$_auth_header"} -o "${_tmp}/${_asset}" -L "${_base}/${_asset}"
  curl -fsSL ${_auth_header:+-H "$_auth_header"} -o "${_tmp}/checksums.txt" -L "${_base}/checksums.txt"

  # Verify SHA256
  (cd "$_tmp" && grep "$_asset" checksums.txt | sha256sum -c -) >&2

  # Extract and install
  tar -xzf "${_tmp}/${_asset}" -C "$_tmp"
  _install_dir="${GOPATH:-$HOME/go}/bin"
  mkdir -p "$_install_dir"
  mv "${_tmp}/entire" "$_install_dir/entire"
  chmod +x "$_install_dir/entire"

  rm -rf "$_tmp"
  echo "[setup-env] Installed entire CLI ${_tag} to ${_install_dir}" >&2

  # Enable entire if not already enabled (non-interactive)
  if ! entire status 2>/dev/null | grep -q "^Enabled"; then
    entire enable --agent claude-code
    echo "[setup-env] Ran entire enable" >&2
  fi
fi

# --- 2. Configure direct GitHub push access (bypass proxy) ---
if [ -n "$GITHUB_TOKEN" ]; then
  PROXY_URL=$(git remote get-url origin 2>/dev/null | sed 's|\(.*\)/git/.*|\1/git/|')
  if [ -n "$PROXY_URL" ]; then
    git config --global url."https://x-access-token:${GITHUB_TOKEN}@github.com/".pushInsteadOf "$PROXY_URL"
    echo "[setup-env] Configured direct GitHub push access" >&2
  fi
fi

# --- 3. Install pre-push filter ---
# Only allow pushing branches matching ALLOWED_PUSH_PREFIXES.
# Entire CLI will chain to this hook via .pre-entire backup.
HOOKS_DIR=$(git rev-parse --git-path hooks 2>/dev/null)
if [ -n "$HOOKS_DIR" ] && [ ! -f "$HOOKS_DIR/pre-push" ]; then
  mkdir -p "$HOOKS_DIR"
  cat > "$HOOKS_DIR/pre-push" << HOOK
#!/bin/sh
ALLOWED_PREFIXES="$ALLOWED_PUSH_PREFIXES"
CURRENT_BRANCH=\$(git symbolic-ref --short HEAD 2>/dev/null)

while read local_ref local_sha remote_ref remote_sha; do
  branch="\${remote_ref#refs/heads/}"
  # Always allow pushing the current branch
  if [ "\$branch" = "\$CURRENT_BRANCH" ]; then
    continue
  fi
  allowed=false
  for prefix in \$ALLOWED_PREFIXES; do
    case "\$branch" in
      "\$prefix"*) allowed=true; break ;;
    esac
  done
  if [ "\$allowed" = false ]; then
    echo "[pre-push] blocked: \$branch (allowed: \$ALLOWED_PREFIXES + current branch)" >&2
    exit 1
  fi
done
HOOK
  chmod +x "$HOOKS_DIR/pre-push"
  echo "[setup-env] Installed pre-push filter (allowed: $ALLOWED_PUSH_PREFIXES)" >&2
fi

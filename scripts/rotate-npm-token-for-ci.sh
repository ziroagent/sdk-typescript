#!/usr/bin/env bash
# Rotate NPM_TOKEN for GitHub Actions and re-run Release on main.
set -euo pipefail

REPO="${1:-ziroagent/sdk-typescript}"

echo "Create an npm **Automation** token: https://www.npmjs.com/settings/~tokens"
echo "  → Generate New Token → Automation (publish @ziro-agent/*)"
echo ""
read -rsp "Paste NPM_TOKEN (hidden): " TOKEN
echo ""

TOKEN="$(printf '%s' "${TOKEN}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
if [ -z "${TOKEN}" ]; then
  echo "error: empty token" >&2
  exit 1
fi

NPMRC_TMP="$(mktemp)"
trap 'rm -f "${NPMRC_TMP}"' EXIT
printf '//registry.npmjs.org/:_authToken=%s\nregistry=https://registry.npmjs.org/\n' "${TOKEN}" > "${NPMRC_TMP}"
export NPM_CONFIG_USERCONFIG="${NPMRC_TMP}"
if ! npm whoami; then
  echo "error: token failed npm whoami — fix token before updating GitHub secret" >&2
  exit 1
fi

gh secret set NPM_TOKEN --repo "${REPO}" --body "${TOKEN}"
echo "Updated NPM_TOKEN on ${REPO}"

echo "Triggering Release workflow on main..."
gh workflow run release.yml --repo "${REPO}" --ref main -f reason=post-token-rotation
echo "Done. Watch: gh run list --workflow=release.yml --repo ${REPO}"

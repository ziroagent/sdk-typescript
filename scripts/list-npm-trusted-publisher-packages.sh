#!/usr/bin/env bash
# List @ziro-agent package names for npm Trusted Publisher setup (workflow: release.yml).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
rg '"name": "@ziro-agent/' "${ROOT}/packages"/*/package.json -o |
  sed 's/"name": "//;s/"$//' |
  sort -u

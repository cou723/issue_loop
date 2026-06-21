#!/usr/bin/env bash
set -euo pipefail

CACHE_DIR="$HOME/.claude/plugins/cache/issue-loop/issue-loop/0.1.0"
PLUGINS_JSON="$HOME/.claude/plugins/installed_plugins.json"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ ! -d "$CACHE_DIR" ]]; then
  echo "Error: cache not found: $CACHE_DIR" >&2
  echo "先に my-room で /install-plugin を実行してください" >&2
  exit 1
fi

rsync -a --delete --exclude='.git' --exclude='README.md' "$REPO_DIR/" "$CACHE_DIR/"

COMMIT_SHA=$(git -C "$REPO_DIR" rev-parse HEAD)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# jq がある場合は使い、なければ sed でフォールバック
if command -v jq &>/dev/null; then
  tmp=$(mktemp)
  jq --arg sha "$COMMIT_SHA" --arg now "$NOW" '
    .plugins["issue-loop@issue-loop"][0].gitCommitSha = $sha |
    .plugins["issue-loop@issue-loop"][0].lastUpdated = $now
  ' "$PLUGINS_JSON" > "$tmp" && mv "$tmp" "$PLUGINS_JSON"
else
  sed -i \
    -e "s|\"gitCommitSha\": \"[0-9a-f]*\"\(.*issue-loop\|$\)|\"gitCommitSha\": \"$COMMIT_SHA\"|" \
    "$PLUGINS_JSON"
fi

echo "Deployed: $COMMIT_SHA"
echo "Cache: $CACHE_DIR"

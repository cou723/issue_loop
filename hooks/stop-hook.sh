#!/bin/bash

# Issue Loop Stop Hook
# Controls whether to continue or end the issue-loop

set -euo pipefail

HOOK_INPUT=$(cat)

STATE_FILE=".claude/issue-loop.local.md"

if [[ ! -f "$STATE_FILE" ]]; then
  exit 0
fi

FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")
ITERATION=$(echo "$FRONTMATTER" | grep '^iteration:' | sed 's/iteration: *//')
MAX_ITERATIONS=$(echo "$FRONTMATTER" | grep '^max_iterations:' | sed 's/max_iterations: *//')
STATUS=$(echo "$FRONTMATTER" | grep '^status:' | sed 's/status: *//' || echo "active")
STATE_SESSION=$(echo "$FRONTMATTER" | grep '^session_id:' | sed 's/session_id: *//' || true)

HOOK_SESSION=$(echo "$HOOK_INPUT" | jq -r '.session_id // ""')
if [[ -n "$STATE_SESSION" ]] && [[ "$STATE_SESSION" != "$HOOK_SESSION" ]]; then
  exit 0
fi

if [[ "$STATUS" == "done" ]]; then
  echo "✅ Issue loop: 取り組む Issue がなくなりました。ループを終了します。"
  rm "$STATE_FILE"
  exit 0
fi

if [[ "$STATUS" == "cancelled" ]]; then
  echo "🛑 Issue loop: キャンセルされました。"
  rm "$STATE_FILE"
  exit 0
fi

if [[ ! "$ITERATION" =~ ^[0-9]+$ ]]; then
  echo "⚠️  Issue loop: 状態ファイルが破損しています (iteration: '$ITERATION')" >&2
  rm "$STATE_FILE"
  exit 0
fi

if [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  echo "⚠️  Issue loop: 状態ファイルが破損しています (max_iterations: '$MAX_ITERATIONS')" >&2
  rm "$STATE_FILE"
  exit 0
fi

if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "🛑 Issue loop: 最大イテレーション数 ($MAX_ITERATIONS) に達しました。"
  rm "$STATE_FILE"
  exit 0
fi

NEXT_ITERATION=$((ITERATION + 1))

PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$STATE_FILE")

if [[ -z "$PROMPT_TEXT" ]]; then
  echo "⚠️  Issue loop: 状態ファイルにプロンプトが見つかりません" >&2
  rm "$STATE_FILE"
  exit 0
fi

TEMP_FILE="${STATE_FILE}.tmp.$$"
sed "s/^iteration: .*/iteration: $NEXT_ITERATION/" "$STATE_FILE" > "$TEMP_FILE"
mv "$TEMP_FILE" "$STATE_FILE"

jq -n \
  --arg prompt "$PROMPT_TEXT" \
  --arg msg "🔄 Issue loop イテレーション $NEXT_ITERATION / $(if [[ $MAX_ITERATIONS -gt 0 ]]; then echo $MAX_ITERATIONS; else echo '∞'; fi)" \
  '{
    "decision": "block",
    "reason": $prompt,
    "systemMessage": $msg
  }'

exit 0

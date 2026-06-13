#!/usr/bin/env bash
# PR状態の差分を収集してJSONで出力する
# 出力: {merged_prs: [...], prs_with_new_comments: [...]}

set -euo pipefail

SNAPSHOT_FILE=".issue-loop/pr-snapshot.json"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [[ -f "$SNAPSHOT_FILE" ]]; then
  LAST_CHECK=$(jq -r '.checked_at' "$SNAPSHOT_FILE")
else
  LAST_CHECK="1970-01-01T00:00:00Z"
fi

# 前回チェック以降にマージされたPR
MERGED_PRS=$(gh pr list --state merged --limit 50 \
  --json number,title,mergedAt \
  --jq "[.[] | select(.mergedAt > \"$LAST_CHECK\") | {number, title}]")

# 前回チェック以降に[issue-loop]以外のコメントが付いたオープンPR
PRS_WITH_NEW_COMMENTS=$(gh pr list --state open --limit 50 \
  --json number,title,comments \
  --jq "
    [.[] |
      . as \$pr |
      [.comments[] |
        select(.createdAt > \"$LAST_CHECK\") |
        select(.body | startswith(\"[issue-loop]\") | not)
      ] as \$new |
      select((\$new | length) > 0) |
      {number: \$pr.number, title: \$pr.title, new_comment_count: (\$new | length)}
    ]
  ")

# スナップショット更新
jq -n --arg now "$NOW" '{checked_at: $now}' > "$SNAPSHOT_FILE"

# 結果をJSONで出力
jq -n \
  --argjson merged "$MERGED_PRS" \
  --argjson new_comments "$PRS_WITH_NEW_COMMENTS" \
  '{merged_prs: $merged, prs_with_new_comments: $new_comments}'

---
description: "実行中の issue-loop を中断する"
allowed-tools: ["Bash(test -f .issue-loop.local.md:*)", "Bash(rm .issue-loop.local.md)", "Read(.issue-loop.local.md)"]
---

# Cancel Issue Loop

1. `test -f .issue-loop.local.md && echo "EXISTS" || echo "NOT_FOUND"` を実行する

2. **NOT_FOUND の場合**: "アクティブな issue-loop はありません。" と表示する

3. **EXISTS の場合**:
   - `.issue-loop.local.md` を読んで現在の `iteration` 番号を確認する
   - `rm .issue-loop.local.md` で状態ファイルを削除する
   - "issue-loop を中断しました（イテレーション N で停止）" と報告する

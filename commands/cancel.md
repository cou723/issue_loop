---
description: "実行中の issue-loop を中断する"
allowed-tools: ["Bash(test -f .claude/issue-loop.local.md:*)", "Bash(rm .claude/issue-loop.local.md)", "Read(.claude/issue-loop.local.md)"]
---

# Cancel Issue Loop

1. `test -f .claude/issue-loop.local.md && echo "EXISTS" || echo "NOT_FOUND"` を実行する

2. **NOT_FOUND の場合**: "アクティブな issue-loop はありません。" と表示する

3. **EXISTS の場合**:
   - `.claude/issue-loop.local.md` を読んで現在の `iteration` 番号を確認する
   - `rm .claude/issue-loop.local.md` で状態ファイルを削除する
   - "issue-loop を中断しました（イテレーション N で停止）" と報告する

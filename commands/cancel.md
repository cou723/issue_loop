---
description: "実行中の issue-loop を中断する"
allowed-tools: ["Bash(test -d .issue-loop)", "Bash(touch .issue-loop/cancel-requested)"]
---

# Cancel Issue Loop

1. `test -d .issue-loop && echo EXISTS || echo NOT_FOUND` を実行する

2. **NOT_FOUND の場合**: 「アクティブな issue-loop はありません。」と表示する

3. **EXISTS の場合**:
   - `touch .issue-loop/cancel-requested` を実行してキャンセルフラグを作成する
   - 「🛑 issue-loop にキャンセルを要求しました。現在のイテレーション完了後に停止します。実行中のイテレーションを直ちに止めるには /workflows から停止してください。」と表示する

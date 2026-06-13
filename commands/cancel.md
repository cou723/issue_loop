---
description: "実行中の issue-loop を中断する"
allowed-tools: ["Bash(test -d .issue-loop)", "Bash(touch .issue-loop/cancel-requested)"]
---

# Cancel Issue Loop

1. `test -d .issue-loop && echo EXISTS || echo NOT_FOUND` を実行する

2. **NOT_FOUND の場合**: 「アクティブな issue-loop はありません。」と表示する

3. **EXISTS の場合**:
   - `touch .issue-loop/cancel-requested` を実行してキャンセルフラグを作成する
   - 「🛑 issue-loop にキャンセルを要求しました。現在実行中のステップ（実装・レビュー等）の区切りで停止します。」と表示する

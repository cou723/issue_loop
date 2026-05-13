---
description: "Issue に記載されたバグを修正する。code-explorer を活用し、スコープ外の発見事項を out-of-scope.md に書き出す"
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Task", "Agent", "Skill"]
---

# Debug

`.claude/issue-loop/current-issue.md` を読み、記載されているバグを修正せよ。

## 手順

1. `feature-dev:code-explorer` エージェントを使用して問題の根本原因を特定する
2. 原因を把握した上で修正を実装する
3. 再発防止策も検討し、必要に応じてテストを追加する
4. 修正中に発見したスコープ外の問題を `.claude/issue-loop/out-of-scope.md` に追記する

## スコープ外の問題の記録

今回の Issue の範囲外で、将来対応すべき問題を発見した場合は `.claude/issue-loop/out-of-scope.md` に追記する:

```
- <問題の概要（1行）>
```

ファイルが存在しない場合は新規作成する。

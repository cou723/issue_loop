---
description: "Issue の内容を実装する。feature-dev を活用し、スコープ外の発見事項を out-of-scope.md に書き出す"
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Task", "Agent", "Skill"]
---

# Implement

`.claude/issue-loop/current-issue.md` を読み、記載されている内容を実装せよ。

## 手順

1. `feature-dev:feature-dev` スキルを活用して実装を進める
2. 実装完了後、`pr-review-toolkit:code-simplifier` エージェントを使用してコードを整理する
3. 実装中に発見したスコープ外の問題を `.claude/issue-loop/out-of-scope.md` に追記する

## スコープ外の問題の記録

今回の Issue の範囲外で、将来対応すべき問題を発見した場合は `.claude/issue-loop/out-of-scope.md` に追記する:

```
- <問題の概要（1行）>
```

ファイルが存在しない場合は新規作成する。

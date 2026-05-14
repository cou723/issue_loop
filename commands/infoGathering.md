---
description: "Issue の不足情報をユーザーへ質問し、回答を Issue にコメントとして追記する"
allowed-tools: ["Bash(gh issue comment *)", "Bash(gh issue view *)", "Read", "Write", "AskUserQuestion"]
---

# Info Gathering

`.claude/issue-loop/current-issue.md` を読み、Issue の実装に必要な情報が揃っているか確認せよ。

## 確認すべき観点

- 受け入れ条件・完了基準が明確か
- 技術的制約・依存ライブラリの指定があるか
- 対象範囲（スコープ）が明確か
- 優先度・緊急度が判断できるか
- 既存機能との互換性要件があるか

## 手順

1. 上記観点でIssueの情報を評価する
2. 不足情報がある場合は `AskUserQuestion` ツールで同期的にユーザーへ質問する
3. 得られた回答を `gh issue comment <number> --body "<内容>"` でIssueにコメントとして追記する
4. `.claude/issue-loop/current-issue.md` の本文末尾に収集情報を追記する

情報が十分揃っている場合は質問せずそのまま終了する。

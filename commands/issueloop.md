---
description: "Issue-loop を開始する。GitHub の Issue を自動的に選び、実装・レビュー・PR 作成までループする"
argument-hint: "[--max-iterations N] [--max-review-iterations N]"
allowed-tools: ["Read", "Write", "Edit(.gitignore)", "Bash(test -f .issue-loop.local.md)", "Bash(mkdir -p .issue-loop)", "Bash(printenv CLAUDE_PLUGIN_ROOT)", "Bash(git checkout -b *)", "Bash(gh issue comment *)", "Bash(touch .issue-loop/iteration-done)", "Skill"]
---

# Issue Loop

## 引数の解釈

`$ARGUMENTS` から以下の値を解釈する（不明なオプションは無視する）:

- `--max-iterations N` → MAX_ITERATIONS = N（デフォルト: 20）
- `--max-review-iterations N` → MAX_REVIEW_ITERATIONS = N（デフォルト: 3）
- `-h` / `--help` → 以下を表示して終了:

```
issue-loop - GitHub Issue ベースの自動開発ループ

USAGE:
  /issue-loop:issueloop [OPTIONS]

OPTIONS:
  --max-iterations N          最大イテレーション数（デフォルト: 20）
  --max-review-iterations N   1イテレーション内の最大レビュー回数（デフォルト: 3）

STOPPING:
  /issue-loop:cancel でループを中断できます
  Issue がなくなった時点で自動終了します
```

## セットアップ

Skill ツールを使用して `issue-loop:setup` スキルを実行する。引数として `--max-iterations <MAX_ITERATIONS> --max-review-iterations <MAX_REVIEW_ITERATIONS>` を渡す。

スキルが失敗した場合（⚠️ メッセージが出た場合）はそこで終了する。

## 開始メッセージ表示

以下を表示する（値を実際に置換する）:

```
🔄 Issue loop を開始しました！

  最大イテレーション数: <MAX_ITERATIONS>
  最大レビュー回数/イテレーション: <MAX_REVIEW_ITERATIONS>

  中断するには /issue-loop:cancel を実行してください。
```

## 最初のイテレーション開始

`.issue-loop/iteration-prompt.md` を Read ツールで読み、指示に従って1イテレーションを実行する。

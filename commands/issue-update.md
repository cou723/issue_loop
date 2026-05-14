---
description: "out-of-scope.md の発見事項と既存 Issue を照合し、重複のない新規 Issue を登録する"
allowed-tools: ["Bash(gh issue create *)", "Bash(gh issue list *)", "Bash(gh issue view *)", "Read"]
---

# Issue Update

`.claude/issue-loop/out-of-scope.md` を読み、スコープ外として記録された問題を GitHub Issue として登録せよ。

## 手順

1. `.claude/issue-loop/out-of-scope.md` が存在しない、または空の場合は終了
2. `gh issue list --state open --limit 100 --json number,title,body` で既存Issue一覧を取得
3. out-of-scope.md の各項目について、既存Issueと内容が重複していないか確認する
   - タイトルや本文が類似している場合は重複とみなして登録をスキップ
4. 重複しない項目を `gh issue create --title "<タイトル>" --body "<詳細な内容>"` で登録する

## 注意

- 既に登録済みの問題を重複登録しないよう注意する
- Issue タイトルは簡潔で検索しやすい形式にする
- Issue 本文には発見した経緯（どのIssue対応中に見つかったか）を記載する

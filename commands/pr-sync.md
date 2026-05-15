---
description: "前回チェック時点との差分を検出し、マージ済みPRと新規コメント付きPRを把握する。新規コメントからIssueを自動作成し、pr-context.md に書き出す"
allowed-tools: ["Bash(bash scripts/pr-sync-gather.sh)", "Bash(gh pr view *)", "Bash(gh issue create *)", "Bash(gh pr comment *)", "Read", "Write"]
---

# PR Sync

## ステップ 1: 差分収集

`bash scripts/pr-sync-gather.sh` を実行する。

出力はJSON形式で、以下の構造を持つ:
- `merged_prs`: 前回チェック以降にマージされたPRのリスト `[{number, title}]`
- `prs_with_new_comments`: 新規コメントが付いたオープンPRのリスト `[{number, title, new_comment_count}]`

スナップショットの更新もスクリプトが自動で行う。

## ステップ 2: 新規コメントからIssueを作成

`prs_with_new_comments` が空であればこのステップをスキップする。

各PRについて以下を行う:

1. `gh pr view <number> --comments --json comments` でコメント一覧を取得する
2. コメントの内容を読み、修正・改善・バグを示唆しているものを抽出する
3. 該当するコメントがあれば Issue を作成する
   - `gh issue create --title "<簡潔なタイトル>" --body "PR #<number> のコメントより\n\n<コメント内容の要約>"`
4. Issue 作成後、対象PRに以下の形式でコメントを投稿する
   - `gh pr comment <number> --body "[issue-loop] Issue #<作成したIssue番号> を作成しました: <タイトル>"`

## ステップ 3: pr-context.md 書き出し

`.claude/issue-loop/pr-context.md` を以下の形式で書き出す。

差分がなければ各セクションに「なし」と書く。

```
## マージされたPR
- #<number>: "<title>"
（なければ「なし」）

## 新規コメントから作成したIssue
- Issue #<number>（PR #<number> のコメントより）: "<タイトル>"
（なければ「なし」）
```

---
description: "マージ済みPRに関連するオープンIssueを一括クローズする"
argument-hint: "[N]  チェックするマージ済みPRの最新件数（デフォルト: 20）"
allowed-tools: ["Bash(gh pr list *)", "Bash(gh issue list *)", "Bash(gh issue close *)", "Bash(mkdir -p *)", "Bash(ls *)", "Bash(cat *)", "Bash(rm -rf *)", "Agent", "Read"]
---

# Issue クローズ

## 引数解釈

`$ARGUMENTS` から N を解釈する（整数1つ、デフォルト: 3）。

## ステップ 1: データ取得

以下を並列で実行する:

- `gh pr list --state merged --limit <N> --json number,title,body,headRefName` でマージ済みPR一覧を取得
- `gh issue list --state open --json number,title --limit 100` でオープンIssue一覧を取得

PRが0件またはオープンIssueが0件なら「チェックすべきデータがありません。」と表示して終了する。

## ステップ 2: 作業ディレクトリ準備

`mkdir -p .issue-loop/close-check` を実行する。

## ステップ 3: 解決判定（並列）

ステップ1で取得した全PR × 全Issueの組み合わせについて、`issue-loop:pr-resolves-issue` エージェントを**すべて同時に並列で**起動する。

各エージェントへの prompt:
```
PR_NUMBER=<PR番号>, ISSUE_NUMBER=<Issue番号> の組み合わせを判定してください。
```

## ステップ 4: 結果集計

全エージェントの完了を待ってから `.issue-loop/close-check/` 以下の全ファイルを `ls` で一覧し、`cat` で読み込む。

ファイル名 `pr<PR番号>-issue<Issue番号>.txt` のうち内容が `yes` のものを抽出し、Issue番号 → 関連PR番号リスト の対応表を作る。

結果ファイルが存在しない組み合わせは `no` として扱う。

## ステップ 5: Issueクローズ

クローズ対象が0件なら「クローズすべき関連Issueが見つかりませんでした。」と表示して終了する。

対象がある場合はまず一覧を表示する:

```
以下のIssueをクローズします:
  #<number>: <title>（PR #<PR番号> がマージ済み）
  ...
```

各Issueをクローズする:

```bash
gh issue close <number> --comment "PR #<関連PR番号> がマージされたためクローズします。"
```

関連PRが複数ある場合は `PR #N, #M がマージされたためクローズします。` の形式にする。

完了後「✅ <N>件のIssueをクローズしました。」と表示する。

## 後処理

`rm -rf .issue-loop/close-check` で一時ファイルを削除する。

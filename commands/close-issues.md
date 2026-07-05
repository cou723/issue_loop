---
description: "マージ済みPRに関連するオープンIssueを一括クローズする"
argument-hint: "[N]  チェックするマージ済みPRの最新件数（デフォルト: 3）"
allowed-tools: ["Bash(gh pr list *)", "Bash(gh issue list *)", "Bash(gh issue close *)", "Bash(mkdir -p .issue-loop/close-check)", "Bash(ls .issue-loop/close-check*)", "Bash(cat .issue-loop/close-check/*)", "Bash(rm -rf .issue-loop/close-check)", "Agent", "Read"]
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

## ステップ 3: 候補ペアの絞り込み

ステップ1で取得した全PR × 全Issueの組み合わせをそのまま判定にかけるとエージェント数が爆発するため、エージェントを使わずこのコマンド自身がステップ1のデータのみで候補ペアを絞り込む。

以下のいずれかを満たす (PR, Issue) の組み合わせを候補とする:

1. PR の本文またはタイトルに `#<Issue番号>` への言及がある
2. PR のブランチ名（`headRefName`）に Issue 番号が含まれる（例: `issue-42-...`, `fix/42-...`）
3. PR タイトルと Issue タイトルが明らかに同じ問題・機能を指している（迷う場合は候補に含める）

候補ペアの上限は30件。超えた場合は条件1・2で一致したペアを優先して30件に切り詰め、「⚠️ 候補ペアが多いため上位30件のみ判定します」と表示する。

候補が0件なら「クローズすべき関連Issueが見つかりませんでした。」と表示して終了する（後続ステップへ進まない）。

## ステップ 4: 解決判定（並列）

候補ペアについてのみ、`issue-loop:pr-resolves-issue` エージェントを**すべて同時に並列で**起動する。

各エージェントへの prompt:
```
PR_NUMBER=<PR番号>, ISSUE_NUMBER=<Issue番号> の組み合わせを判定してください。
```

## ステップ 5: 結果集計

全エージェントの完了を待ってから `ls .issue-loop/close-check` で全ファイルを一覧し、`cat .issue-loop/close-check/*.txt` で読み込む。

ファイル名 `pr<PR番号>-issue<Issue番号>.txt` のうち内容が `yes` のものを抽出し、Issue番号 → 関連PR番号リスト の対応表を作る。

結果ファイルが存在しない組み合わせは `no` として扱う。

## ステップ 6: Issueクローズ

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

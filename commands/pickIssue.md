---
description: "GitHub から最優先で取り組むべき Issue を1つ選んで current-issue.md に書き出す"
allowed-tools: ["Bash(gh issue list *)", "Bash(gh issue view *)", "Bash(gh pr list *)", "Read", "Write"]
---

# Pick Issue

GitHub からこのリポジトリのオープン Issue を取得し、最優先で取り組むべき Issue を1つ選んで `.issue-loop/current-issue.md` に書き出せ。

**重要**: ユーザーへの質問・確認・選択肢の提示は一切禁止。どんな状況でも自律的に判断して `current-issue.md` を書き出してこのスキルを終了すること。

## 手順

1. `gh issue list --state open --limit 50 --json number,title,body,labels,milestone` でIssue一覧取得
2. `gh pr list --state open --json number,title,headRefName` で既存PR一覧取得
3. `.issue-loop/pr-context.md` を読み、マージ済みPR一覧を把握する
4. Issue本文内の "depends on #N"、"blocked by #N" などの依存関係を確認する。依存先が未解決かどうかは `gh issue view #N` でクローズ済みか確認し、クローズ済みまたはpr-context.mdのマージ済みリストに含まれていれば解決済みとみなす
5. 既存PRが紐づくIssueは除外
6. マイルストーン優先度・ラベル・番号順（小さい番号優先）で最優先Issueを1つ選ぶ

## 出力

Issue が**見つからない**場合、`.issue-loop/current-issue.md` に以下を書く:

```
---
number: 0
title: "NO_ISSUE"
type: ""
---
```

Issue が**見つかった**場合、`gh issue view <番号> --json body,comments` でIssue本文とコメント一覧を取得し、`.issue-loop/current-issue.md` に以下を書く:

```
---
number: <番号>
title: "<タイトル>"
type: ""
---

<Issueの本文>

## コメント

<各コメントを「**@<author>**: <body>」の形式で列挙。コメントがない場合はこのセクションごと省略>
```

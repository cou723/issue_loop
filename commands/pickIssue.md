---
description: "GitHub から最優先で取り組むべき Issue を1つ選んで current-issue.md に書き出す"
allowed-tools: ["Bash(gh issue list:*)", "Bash(gh issue view:*)", "Bash(gh pr list:*)", "Read", "Write"]
---

# Pick Issue

GitHub からこのリポジトリのオープン Issue を取得し、最優先で取り組むべき Issue を1つ選んで `.claude/issue-loop/current-issue.md` に書き出せ。

## 手順

1. `gh issue list --state open --limit 50 --json number,title,body,labels,milestone` でIssue一覧取得
2. `gh pr list --state open --json number,title,headRefName` で既存PR一覧取得
3. Issue本文内の "depends on #N"、"blocked by #N" などの依存関係を確認し、依存先が未解決なら除外
4. 既存PRが紐づくIssueは除外
5. マイルストーン優先度・ラベル・番号順（小さい番号優先）で最優先Issueを1つ選ぶ

## 出力

Issue が**見つからない**場合、`.claude/issue-loop/current-issue.md` に以下を書く:

```
---
number: 0
title: "NO_ISSUE"
type: ""
---
```

Issue が**見つかった**場合、`.claude/issue-loop/current-issue.md` に以下を書く:

```
---
number: <番号>
title: "<タイトル>"
type: ""
---

<gh issue view <番号> --json body で取得したIssueの本文>
```

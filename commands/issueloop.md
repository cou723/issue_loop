---
description: "Issue-loop を開始する。GitHub の Issue を自動的に選び、実装・レビュー・PR 作成までループする"
argument-hint: "[--max-iterations N] [--max-review-iterations N]"
allowed-tools: ["Bash(mkdir -p .claude/issue-loop)", "Bash(test -f .claude/issue-loop.local.md)", "Read", "Write", "Bash(git checkout -b *)", "Bash(gh issue comment *)", "Skill"]
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

## セットアップ手順

**1. 重複チェック**

`test -f .claude/issue-loop.local.md && echo "EXISTS" || echo "NOT_FOUND"` を実行する。

`EXISTS` の場合、以下を表示して終了する:
```
⚠️  既にアクティブな issue-loop があります。
   /issue-loop:cancel で停止してから再度実行してください。
```

**2. ディレクトリ作成**

`mkdir -p .claude/issue-loop` を実行する。

**3. イテレーションプロンプトファイル作成**

Write ツールで `.claude/issue-loop/iteration-prompt.md` を以下の内容で作成する:

```
# Issue Loop - 1イテレーション実行

`.claude/issue-loop.local.md` から `max_review_iterations` の値を取得して使用する。
エラーが発生した場合は `gh issue comment <number> --body "自動化失敗: <理由>"` を実行して次のステップへ進む。

## 共通ルール

git の書き込み操作 (`git add`, `git commit`, `git push`) は直接コマンドを叩かず、必ず対応する Skill を使うこと。
- コミットのみ: `commit-commands:commit` スキル
- コミット+プッシュ+PR 作成: `commit-commands:commit-push-pr` スキル

## ステップ 1: Issue 選定

Skill ツールを使用して `issue-loop:pickIssue` スキルを実行する。

## ステップ 2: Issue 確認

`.claude/issue-loop/current-issue.md` を読む。
`title: "NO_ISSUE"` の場合:
- `.claude/issue-loop.local.md` を読み、フロントマターの `status: active` を `status: done` に変更して保存する
- 処理を終了する（Stop hook がループを終了させる）

## ステップ 3: 情報収集

Skill ツールを使用して `issue-loop:infoGathering` スキルを実行する。

## ステップ 4: Issue 分類

Skill ツールを使用して `issue-loop:pattern` スキルを実行する。

## ステップ 5: ブランチ作成

`.claude/issue-loop/current-issue.md` を読んでIssue番号とタイトルを取得する。
ブランチ名を `issue-<番号>-<kebab-case-slug>` 形式で決定する（タイトルから英数字・ハイフンのみ使用）。
`git checkout -b <ブランチ名>` を実行する。

## ステップ 6: 実装またはデバッグ

`.claude/issue-loop/next-action.md` を読む。
`.claude/issue-loop/out-of-scope.md` が存在する場合は空にしてリセットする。

- `implement` の場合: Skill ツールを使用して `issue-loop:implement` スキルを実行する
- `debug` の場合: Skill ツールを使用して `issue-loop:debug` スキルを実行する

## ステップ 7: レビューループ

`.claude/issue-loop.local.md` から `max_review_iterations` を読む。

最大 `max_review_iterations` 回、以下を繰り返す:

a. Skill ツールを使用して `issue-loop:review` スキルを実行する

b. `.claude/issue-loop/review-result.md` を読む:
   - `status: pass` → ループを抜ける
   - `status: fail` かつ上限未到達 → `review-result.md` のスコープ内指摘を参照しながら、ステップ 6 と同じ種類のスキル（implement または debug）を再実行する
   - 上限到達 → ループを抜ける

## ステップ 8: Issue 更新

Skill ツールを使用して `issue-loop:issue-update` スキルを実行する。

## ステップ 9: PR 作成

Skill ツールを使用して `issue-loop:push-and-pr` スキルを実行する。
```

**4. 状態ファイル作成**

Write ツールで `.claude/issue-loop.local.md` を以下の内容で作成する（`MAX_ITERATIONS` と `MAX_REVIEW_ITERATIONS` には解釈した値を入れる）:

```
---
iteration: 1
max_iterations: <MAX_ITERATIONS>
max_review_iterations: <MAX_REVIEW_ITERATIONS>
session_id: 
status: active
---

`.claude/issue-loop/iteration-prompt.md` を読み、指示に従って1イテレーションを実行せよ。
```

**5. 開始メッセージ表示**

以下を表示する（値を実際に置換する）:

```
🔄 Issue loop を開始しました！

  最大イテレーション数: <MAX_ITERATIONS>
  最大レビュー回数/イテレーション: <MAX_REVIEW_ITERATIONS>

  中断するには /issue-loop:cancel を実行してください。
```

**6. 最初のイテレーション開始**

`.claude/issue-loop/iteration-prompt.md` を Read ツールで読み、指示に従って1イテレーションを実行する。

---
description: "Issue-loop の初期セットアップ。重複チェック・.gitignore 確認・状態ファイル作成を行う"
argument-hint: "--max-iterations N --max-review-iterations M"
allowed-tools: ["Bash(test -f .issue-loop.local.md)", "Bash(mkdir -p .issue-loop)", "Bash(echo $CLAUDE_PLUGIN_ROOT)", "Read", "Write", "Edit(.gitignore)"]
---

# Issue Loop セットアップ

`$ARGUMENTS` から以下の値を取得する:

- `--max-iterations N` → MAX_ITERATIONS = N（デフォルト: 20）
- `--max-review-iterations N` → MAX_REVIEW_ITERATIONS = N（デフォルト: 3）

## ステップ 1: 重複チェック

`test -f .issue-loop.local.md && echo "EXISTS" || echo "NOT_FOUND"` を実行する。

`EXISTS` の場合、以下を表示して終了する:
```
⚠️  既にアクティブな issue-loop があります。
   /issue-loop:cancel で停止してから再度実行してください。
```

## ステップ 2: .gitignore チェック

`.gitignore` に `.issue-loop*` が含まれているか確認する。含まれていない場合は `.gitignore` に以下を追記する:

```
.issue-loop*
```

追記した場合は、Skill ツールを使用して `commit-commands:commit` スキルを実行し、`.gitignore` の変更をコミットする。

## ステップ 3: ディレクトリ作成

`mkdir -p .issue-loop` を実行する。

## ステップ 3.5: PR同期ラッパースクリプト作成

`echo "$CLAUDE_PLUGIN_ROOT"` を実行してプラグインのルートパスを取得する（以下 PLUGIN_ROOT と呼ぶ）。

**重要**: 取得した値が空の場合は即座に以下を表示して終了する:
```
❌ CLAUDE_PLUGIN_ROOT が設定されていません。プラグインが正しくインストールされているか確認してください。
```

Write ツールで `.issue-loop/pr-sync-gather.sh` を作成する。`<PLUGIN_ROOT>` を取得した**実際の絶対パス**に置換すること。**`$CLAUDE_PLUGIN_ROOT` や `${CLAUDE_PLUGIN_ROOT}` のような変数参照をそのまま書いてはいけない**（このスクリプトはClaude Codeの外のシェルで実行されるため、変数が展開されない）:

```
#!/bin/bash
bash "<PLUGIN_ROOT>/scripts/pr-sync-gather.sh" "$@"
```

## ステップ 4: イテレーションプロンプトファイル作成

Write ツールで `.issue-loop/iteration-prompt.md` を以下の内容で作成する:

```
# Issue Loop - 1イテレーション実行

`.issue-loop.local.md` から `max_review_iterations` の値を取得して使用する。
エラーが発生した場合は `gh issue comment <number> --body "自動化失敗: <理由>"` を実行して次のステップへ進む。

## 共通ルール

git の書き込み操作 (`git add`, `git commit`, `git push`) は直接コマンドを叩かず、必ず対応する Skill を使うこと。
- コミットのみ: `commit-commands:commit` スキル
- コミット+プッシュ+PR 作成: `commit-commands:commit-push-pr` スキル

`issue-loop:setup` スキルは絶対に呼ばないこと（セットアップ済み）。エラーが発生しても再セットアップは不要。

## ステップ 1: PR 同期

Skill ツールを使用して `issue-loop:pr-sync` スキルを実行する。

## ステップ 2: Issue 選定

Skill ツールを使用して `issue-loop:pickIssue` スキルを実行する。

## ステップ 3: Issue 確認

`.issue-loop/current-issue.md` を読む。
`title: "NO_ISSUE"` の場合:
- `.issue-loop.local.md` を読み、フロントマターの `status: active` を `status: done` に変更して保存する
- 処理を終了する（Stop hook がループを終了させる）

## ステップ 4: 情報収集

Skill ツールを使用して `issue-loop:infoGathering` スキルを実行する。

## ステップ 5: Issue 分類

Skill ツールを使用して `issue-loop:pattern` スキルを実行する。

## ステップ 6: ブランチ作成

`.issue-loop/current-issue.md` を読んでIssue番号とタイトルを取得する。
ブランチ名を `issue-<番号>-<kebab-case-slug>` 形式で決定する（タイトルから英数字・ハイフンのみ使用）。
`git checkout -b <ブランチ名>` を実行する。

## ステップ 7: 実装またはデバッグ

`.issue-loop/next-action.md` を読む。
`.issue-loop/out-of-scope.md` が存在する場合は空にしてリセットする。

- `implement` の場合: Skill ツールを使用して `issue-loop:implement` スキルを実行する
- `debug` の場合: Skill ツールを使用して `issue-loop:debug` スキルを実行する

## ステップ 8: レビューループ

`.issue-loop.local.md` から `max_review_iterations` を読む。

最大 `max_review_iterations` 回、以下を繰り返す:

a. Skill ツールを使用して `issue-loop:review` スキルを実行する

b. `.issue-loop/review-result.md` を読む:
   - `status: pass` → ループを抜ける
   - `status: fail` かつ上限未到達 → `review-result.md` のスコープ内指摘を参照しながら、ステップ 7 と同じ種類のスキル（implement または debug）を再実行する
   - 上限到達 → ループを抜ける

## ステップ 9: Issue 更新

Skill ツールを使用して `issue-loop:issue-update` スキルを実行する。

## ステップ 10: PR 作成

Skill ツールを使用して `issue-loop:push-and-pr` スキルを実行する。

## ステップ 11: イテレーション完了フラグ作成

`touch .issue-loop/iteration-done` を実行する。
```

## ステップ 5: 状態ファイル作成

Write ツールで `.issue-loop.local.md` を以下の内容で作成する（`MAX_ITERATIONS` と `MAX_REVIEW_ITERATIONS` には解釈した値を入れる）:

```
---
iteration: 1
max_iterations: <MAX_ITERATIONS>
max_review_iterations: <MAX_REVIEW_ITERATIONS>
session_id: 
status: active
---

`.issue-loop/iteration-prompt.md` を読み、指示に従って1イテレーションを実行せよ。
```

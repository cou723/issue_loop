---
description: "（試作）dynamic workflow ランタイム上で issue loop を実行する。/issue-loop:issueloop の workflow 版検証用。ユーザーが「workflow 版の issue loop を開始して」などと依頼した場合に呼び出される"
argument-hint: "[-mi N] [--max-review-iterations N] [--comment TEXT, -c TEXT] [-h, --help]"
allowed-tools: ["Bash(bash *setup-issue-loop.sh)", "Bash(test -f .issue-loop/cancel-requested)", "Bash(test -f .issue-loop/ci.sh)", "Bash(chmod +x .issue-loop/ci.sh)", "Bash(rm -f .issue-loop/issue-selection-comment.md)", "Workflow", "Agent", "AskUserQuestion", "Read", "Write"]
---

# Issue Loop（workflow 試作版）

`/issue-loop:issueloop` の dynamic workflow ランタイム実装の試作。1イテレーション分のオーケストレーション（PR同期→Issue選定→実装/レビュー→PR作成）は `workflows/iteration.js` のスクリプトが実行し、このコマンドは**ループ制御・ユーザーへの質問代行・キャンセル確認のみ**を行う。

従来版との違い:

- `.issue-loop/iteration-signal` などのシグナルファイルは使わない。イテレーションの結果は workflow の構造化リターン（`signal` フィールド）で受け取る
- `NEEDS_INPUT` 後の再開は `resumeFromRunId` で行う（完了済みステップはランタイムのキャッシュが返るため、RESUME フラグやステップスキップの規約は不要）
- 実行中のイテレーションの中断は `/workflows` ビューの停止操作で行う（イテレーション間の中断は従来どおり `/issue-loop:cancel`）

## 引数の解釈

`$ARGUMENTS` から以下の値を解釈する（不明なオプションは無視する）:

- `--max-iterations N` / `-mi N` → MAX_ITERATIONS = N（デフォルト: 20）
- `--max-review-iterations N` → MAX_REVIEW_ITERATIONS = N（デフォルト: 3）
- `--comment TEXT` / `-c TEXT` → ISSUE_SELECTION_COMMENT = TEXT
- `-h` / `--help` → USAGE（従来版と同じオプション体系。コマンド名のみ `/issue-loop:issueloop-wf`）を表示して終了

このループは**有人実行**を前提とする。Issue の情報が不足している場合、workflow は `NEEDS_INPUT` を返して終了し、このメインセッションがユーザーへ質問して回答を渡して再開する。

## セットアップ

1. `bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup-issue-loop.sh"` を実行する
2. Issue 選定コメント: `ISSUE_SELECTION_COMMENT` が指定されていれば `.issue-loop/issue-selection-comment.md` に Write し、なければ `rm -f .issue-loop/issue-selection-comment.md` で削除する
3. CI スクリプト生成: `test -f .issue-loop/ci.sh` で存在しない場合のみ、`/issue-loop:issueloop`（`commands/issueloop.md`）の「CI スクリプト生成」セクションと同一の手順で `.issue-loop/ci.sh` を生成する

## 開始メッセージ

以下を表示する（値を実際に置換する）:

```
🔄 Issue loop（workflow 試作版）を開始しました！

  最大イテレーション数: <MAX_ITERATIONS>
  最大レビュー回数/イテレーション: <MAX_REVIEW_ITERATIONS>
  <ISSUE_SELECTION_COMMENT が指定されている場合のみ表示>
  Issue 選定コメント: <ISSUE_SELECTION_COMMENT>

  実行中のイテレーションは /workflows から停止できます。
  イテレーション間の中断は /issue-loop:cancel を実行してください。
```

## ループ

iteration = 1 から始め MAX_ITERATIONS 回を上限に以下を繰り返す。上限超過時は「🛑 最大イテレーション数 (<MAX_ITERATIONS>) に達しました。」と表示して終了する。

### 1. イテレーション開始

「🔄 イテレーション <iteration> / <MAX_ITERATIONS> を開始します」と表示する。

`test -f .issue-loop/cancel-requested && echo CANCEL || echo OK` を実行し、CANCEL なら「🛑 キャンセルリクエストを受け付けました。」と表示してループを終了する。

### 2. workflow 起動

Workflow ツールを以下の入力で起動し、実行完了まで待つ:

- `scriptPath`: `"${CLAUDE_PLUGIN_ROOT}/workflows/iteration.js"`
- `args`: `{ "pluginRoot": "<CLAUDE_PLUGIN_ROOT の実パス>", "maxReviewIterations": <MAX_REVIEW_ITERATIONS>, "answers": null }`

### 3. 結果確認

workflow の戻り値の `signal` フィールドで分岐する:

- `DONE` → 「✅ イテレーション <iteration> 完了: Issue #<issue> → PR <prUrl>」と表示する。`reviewStatus` が `fail` の場合は「⚠️ レビュー上限に達したため未解決の指摘が残っています」を併記する。iteration を increment して次イテレーションへ
- `NO_ISSUE` → 「✅ 取り組む Issue がなくなりました。ループを終了します。」と表示してループを終了する
- `FAILED` → 「❌ イテレーション <iteration> が失敗しました: <reason>。安全のためループを終了します。」と表示してループを終了する
- `NEEDS_INPUT` → 下記「ユーザーへの質問」を実行する
- 戻り値が取得できない・`signal` が読めない（workflow の異常終了や手動停止を含む）→ 「⚠️ イテレーション <iteration> が結果を残さず終了しました。安全のためループを終了します。」と表示してループを終了する

### 4. ユーザーへの質問（NEEDS_INPUT 処理）

workflow は AskUserQuestion を使えないため、質問はこのメインセッションが代行する。

1. 「⚠️ Issue #<issue> の実装に必要な情報が不足しています。以下の質問に回答してください。」とテキストで表示する
2. 戻り値の `questions` 配列（`question` / `header` / `multiSelect` / `options`）を `AskUserQuestion` ツールの形式に変換し、まとめて質問する
3. Workflow ツールを**再起動**する:
   - `scriptPath`: 同じ
   - `resumeFromRunId`: 直前の run の ID
   - `args`: `{ "pluginRoot": <同じ>, "maxReviewIterations": <同じ>, "answers": [{ "question": "<質問文>", "answer": "<ユーザーの回答>" }, ...] }`
   - **iteration カウントは増やさない**（同じ Issue の続きを実行するため。PR同期・Issue選定はキャッシュから返り、情報収集以降が再実行される）
4. 完了後、再度「3. 結果確認」を行う

## ループ終了後

以下を表示する:

```
🏁 Issue loop（workflow 試作版）が完了しました。
  実行イテレーション数: <完了したイテレーション数>
```

Agent ツールで `issue-loop:result-dashboard` サブエージェントを起動し、今回の実行結果ダッシュボードを表示する。

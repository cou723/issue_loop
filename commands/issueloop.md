---
description: "GitHub Issue を自動的に選定・実装・レビュー・PR作成まで繰り返し処理する自動開発ループを開始する。ユーザーが「issue loop を開始して」「未対応の Issue を自動で片付けて」「次の Issue に取り組んで」などと依頼した場合に呼び出される"
argument-hint: "[-mi N] [--max-iterations N] [--max-review-iterations N] [--comment TEXT, -c TEXT] [-h, --help]"
model: opus
allowed-tools: ["Bash(bash *setup-issue-loop.sh)", "Bash(test -f .issue-loop/cancel-requested)", "Bash(test -f .issue-loop/ci.sh)", "Bash(chmod +x .issue-loop/ci.sh)", "Bash(rm -f .issue-loop/issue-selection-comment.md)", "Workflow", "Agent", "AskUserQuestion", "Read", "Write", "Skill(issue-loop:consolidate-issues)"]
---

# Issue Loop

dynamic workflow ランタイム上で動く。1イテレーション分のオーケストレーション（PR同期→Issue選定→実装/レビュー→PR作成）は `workflows/iteration.js` のスクリプトが実行し、このコマンドは**ループ制御・ユーザーへの質問代行・キャンセル確認のみ**を行う。

- イテレーションの結果は workflow の構造化リターン（`signal` フィールド）で受け取る
- `NEEDS_INPUT` 後の再開は `resumeFromRunId` で行う（完了済みステップはランタイムのキャッシュが返る）。ただしキャッシュは workflow を起動したセッション内でのみ有効で、セッション再起動を挟んで `resumeFromRunId` を渡した場合は完了済みステップも再実行される（正常に完走はする）
- 実行中のイテレーションの中断は `/workflows` ビューの停止操作で行う（イテレーション間の中断は `/issue-loop:cancel`）

## 引数の解釈

`$ARGUMENTS` から以下の値を解釈する（不明なオプションは無視する）:

- `--max-iterations N` / `-mi N` → MAX_ITERATIONS = N（デフォルト: 20）
- `--max-review-iterations N` → MAX_REVIEW_ITERATIONS = N（デフォルト: 3）
- `--comment TEXT` / `-c TEXT` → ISSUE_SELECTION_COMMENT = TEXT
- `-h` / `--help` → 以下を表示して終了:

```
issue-loop - GitHub Issue ベースの自動開発ループ

USAGE:
  /issue-loop:issueloop [OPTIONS]

OPTIONS:
  --max-iterations N, -mi N   最大イテレーション数（デフォルト: 20）
  --max-review-iterations N   1イテレーション内の最大レビュー回数（デフォルト: 3）
  --comment TEXT, -c TEXT     Issue 選定時の追加基準（例: "バグ修正を優先"）

STOPPING:
  実行中のイテレーションは /workflows から停止できます
  イテレーション間の中断は /issue-loop:cancel を実行してください
  Issue がなくなった時点で自動終了します
```

このループは**有人実行**を前提とする。Issue の情報が不足している場合、workflow は `NEEDS_INPUT` を返して終了し、このメインセッションがユーザーへ質問して回答を渡して再開する。

## セットアップ

1. `bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup-issue-loop.sh"` を実行する
2. Issue 選定コメント: `ISSUE_SELECTION_COMMENT` が指定されていれば `.issue-loop/issue-selection-comment.md` に Write し、なければ `rm -f .issue-loop/issue-selection-comment.md` で削除する
3. CI スクリプト生成: 下記「CI スクリプト生成」を行う

### CI スクリプト生成

`test -f .issue-loop/ci.sh` を実行し、ファイルが**存在しない場合のみ**以下を行う。

ci.sh はリモート CI が実行するチェックのローカル再現である。ci.sh がリモート CI より緩いと、ループ内のレビューを通過したのにリモート CI で落ちる PR が生まれる。したがって CI 定義が存在する場合は、推測せず定義から転記する。

**手順1: CI 定義からの転記（優先）**

`.github/workflows/` 配下の YAML を Read で確認する。push / pull_request でトリガーされる workflow があれば、そのジョブの `run` ステップから検証コマンド（lint / format / typecheck / test / build 等）を抽出し、実行コマンドをそのまま ci.sh に転記する。以下は除外する:

- セットアップ系（checkout、ランタイムのインストール、依存インストール、キャッシュ）
- デプロイ・リリース・通知系
- CI 環境でしか実行できないもの（シークレット必須、matrix 固有など）

**手順2: ビルドシステムからの推測（CI 定義がない場合のみ）**

以下のファイルを Read で確認し、このプロジェクトのビルドシステムと使用可能なCIコマンドを判断する:

- `package.json`（lint / format / test スクリプトの有無）
- `Makefile`（lint / test などターゲットの有無）
- `Cargo.toml`（Rust: `cargo fmt --check`, `cargo clippy`, `cargo test`）
- `pyproject.toml` / `setup.py`（Python: ruff, pytest など）
- `go.mod`（Go: `go vet`, `go test ./...`）
- `pom.xml` / `build.gradle`（Java / Kotlin: maven / gradle）

いずれの手順でも、判断したCIコマンドを組み合わせた `.issue-loop/ci.sh` を Write で生成する（全チェックが通る場合のみ終了コード 0 を返す構成にする）。その後 `chmod +x .issue-loop/ci.sh` を実行する。

どちらの手順でも判断できない場合は、`.issue-loop/ci.sh` を生成せずスキップする。

## 開始メッセージ

以下を表示する（値を実際に置換する）:

```
🔄 Issue loop を開始しました！

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
- `args`: `{ "pluginRoot": "${CLAUDE_PLUGIN_ROOT}", "maxReviewIterations": <MAX_REVIEW_ITERATIONS>, "answers": null }` を **JSON オブジェクトとして渡す**（JSON 文字列に変換して渡してはならない）
- `pluginRoot` の値はこのコマンド本文のロード時に実パスへ展開済みである。上記の値をそのまま転記し、**推測・導出・書き換えをしない**（誤ったパスを渡すと workflow は指示ファイルを読めず `FAILED` を返す）

### 3. 結果確認

workflow の戻り値の `signal` フィールドで分岐する:

- `DONE` → 「✅ イテレーション <iteration> 完了: Issue #<issue> → PR <prUrl>」と表示する。`reviewStatus` が `fail` の場合は「⚠️ レビュー上限に達したため未解決の指摘が残っています」を併記する。iteration を increment して次イテレーションへ
- `NO_ISSUE` → 「✅ 取り組む Issue がなくなりました。ループを終了します。」と表示してループを終了する
- `FAILED` → 「❌ イテレーション <iteration> が失敗しました: <reason>。安全のためループを終了します。」と表示してループを終了する
- `NEEDS_INPUT` → 下記「ユーザーへの質問」を実行する
- 戻り値が取得できない・`signal` が読めない（workflow の異常終了や手動停止を含む）→ 「⚠️ イテレーション <iteration> が結果を残さず終了しました。安全のためループを終了します。」と表示してループを終了する

`FAILED` および戻り値なしで終了する場合、独自の復旧を試みてはならない: 原因調査・プラグインや workflow スクリプトの修正・実装や PR 作成の続行はすべて禁止。メッセージを表示したら「ループ終了後」の処理へ直接進む。

### 4. ユーザーへの質問（NEEDS_INPUT 処理）

workflow は AskUserQuestion を使えないため、質問はこのメインセッションが代行する。

1. 「⚠️ Issue #<issue> の実装に必要な情報が不足しています。以下の質問に回答してください。」とテキストで表示する
2. 戻り値の `questions` 配列（`question` / `header` / `multiSelect` / `options`）を `AskUserQuestion` ツールの形式に変換し、まとめて質問する
3. Workflow ツールを**再起動**する:
   - `scriptPath`: 同じ
   - `resumeFromRunId`: 直前の run の ID
   - `args`: `{ "pluginRoot": "${CLAUDE_PLUGIN_ROOT}", "maxReviewIterations": <同じ>, "answers": [{ "question": "<質問文>", "answer": "<ユーザーの回答>" }, ...] }` を **JSON オブジェクトとして渡す**（JSON 文字列に変換して渡してはならない）
   - **iteration カウントは増やさない**（同じ Issue の続きを実行するため）
   - キャッシュは workflow を起動したセッション内でのみ有効。同一セッションで再開する場合は PR同期・Issue選定がキャッシュから返り情報収集以降が再実行されるが、セッション再起動（中断からの再開など）を挟んで `resumeFromRunId` を渡した場合は完了済みステップも再実行される（動作自体は正常に完走する）
4. 完了後、再度「3. 結果確認」を行う

## ループ終了後

以下を表示する:

```
🏁 Issue loop が完了しました。
  実行イテレーション数: <完了したイテレーション数>
```

Agent ツールで `issue-loop:result-dashboard` サブエージェントを**同期**（`run_in_background: false`）で起動し、今回の実行結果ダッシュボードを表示する。

### Issue 統合

ダッシュボード表示後、Skill ツールで `issue-loop:consolidate-issues` を起動し、実行中に増えた細粒度の Issue を統合する（統合案の承認はユーザーへ質問する）。ただしイテレーションが1回も完了しなかった場合（初回で `NO_ISSUE` / `FAILED`）は Issue が増えていないためスキップする。

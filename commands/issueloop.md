---
description: "GitHub Issue を自動的に選定・実装・レビュー・PR作成まで繰り返し処理する自動開発ループを開始する。ユーザーが「issue loop を開始して」「未対応の Issue を自動で片付けて」「次の Issue に取り組んで」などと依頼した場合に呼び出される"
argument-hint: "[-mi N] [--max-iterations N] [--max-review-iterations N] [--comment TEXT, -c TEXT] [-h, --help]"
allowed-tools: ["Bash(bash *setup-issue-loop.sh)", "Bash(test -f .issue-loop/cancel-requested)", "Bash(test -f .issue-loop/ci.sh)", "Bash(chmod +x .issue-loop/ci.sh)", "Bash(rm -f .issue-loop/iteration-signal)", "Bash(rm -f .issue-loop/questions.md)", "Bash(rm -f .issue-loop/answers.md)", "Bash(rm -f .issue-loop/issue-selection-comment.md)", "Bash(grep * .issue-loop/iteration-signal)", "Bash(git branch *)", "Bash(gh pr list *)", "Agent", "AskUserQuestion", "Read", "Write"]
---

# Issue Loop

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
  /issue-loop:cancel でループを中断できます
  Issue がなくなった時点で自動終了します
```

このループは**有人実行**を前提とする。Issue の情報が不足している場合は、ループを止めてユーザーへ質問し（後述の `NEEDS_INPUT` 処理）、回答を得てから実装を進める。

## セットアップ

`bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup-issue-loop.sh"` を実行する。

## Issue 選定コメントの設定

`ISSUE_SELECTION_COMMENT` が指定されている場合:

1. `.issue-loop/issue-selection-comment.md` にコメント本文を Write する
2. ファイルの内容は `pick-issue` エージェントが選定基準として読み取る

`ISSUE_SELECTION_COMMENT` が指定されていない場合:

1. `rm -f .issue-loop/issue-selection-comment.md` を実行してファイルを削除する
2. これにより `pick-issue` エージェントは既定の基準（マイルストーン・ラベル・番号順）で Issue を選定する

## CI スクリプト生成

`test -f .issue-loop/ci.sh` を実行し、ファイルが**存在しない場合のみ**以下を行う。

以下のファイルを Read で確認し、このプロジェクトのビルドシステムと使用可能なCIコマンドを判断する:

- `package.json`（lint / format / test スクリプトの有無）
- `Makefile`（lint / test などターゲットの有無）
- `Cargo.toml`（Rust: `cargo fmt --check`, `cargo clippy`, `cargo test`）
- `pyproject.toml` / `setup.py`（Python: ruff, pytest など）
- `go.mod`（Go: `go vet`, `go test ./...`）
- `pom.xml` / `build.gradle`（Java / Kotlin: maven / gradle）

判断したCIコマンドを組み合わせた `.issue-loop/ci.sh` を Write で生成する（全チェックが通る場合のみ終了コード 0 を返す構成にする）。その後 `chmod +x .issue-loop/ci.sh` を実行する。

ビルドシステムが判断できない場合は、`.issue-loop/ci.sh` を生成せずスキップする。

## 開始メッセージ

以下を表示する（値を実際に置換する）:

```
🔄 Issue loop を開始しました！

  最大イテレーション数: <MAX_ITERATIONS>
  最大レビュー回数/イテレーション: <MAX_REVIEW_ITERATIONS>
  <ISSUE_SELECTION_COMMENT が指定されている場合のみ表示>
  Issue 選定コメント: <ISSUE_SELECTION_COMMENT>

  中断するには /issue-loop:cancel を実行してください。
```

## ループ

iteration = 1 から始め MAX_ITERATIONS 回を上限に以下を繰り返す。上限超過時は「🛑 最大イテレーション数 (<MAX_ITERATIONS>) に達しました。」と表示して終了する。

---

### イテレーション開始

「🔄 イテレーション <iteration> / <MAX_ITERATIONS> を開始します」と表示する。

`test -f .issue-loop/cancel-requested && echo CANCEL || echo OK` を実行し、CANCEL なら「🛑 キャンセルリクエストを受け付けました。」と表示してループを終了する。

---

### イテレーション実行

前イテレーションの遺物をクリアする（古いシグナルや質問・回答を誤読しないため）:
- `rm -f .issue-loop/iteration-signal`
- `rm -f .issue-loop/questions.md`
- `rm -f .issue-loop/answers.md`

Agent ツールで `issue-loop:iteration` サブエージェントを起動する。
- prompt: "イテレーションを実行してください。MAX_REVIEW_ITERATIONS = <MAX_REVIEW_ITERATIONS>, RESUME = false"

---

### シグナル確認

`grep -s "" .issue-loop/iteration-signal` を実行してシグナルを確認する。

- `NO_ISSUE` → 「✅ 取り組む Issue がなくなりました。ループを終了します。」と表示してループを終了する
- `CANCELLED` → 「🛑 キャンセルリクエストを受け付けました。」と表示してループを終了する
- `FAILED` → 「❌ イテレーション <iteration> が失敗しました。安全のためループを終了します。`.issue-loop/` の状態を確認してください。」と表示してループを終了する
- `NEEDS_INPUT` → **下記「ユーザーへの質問（NEEDS_INPUT 処理）」を実行する**。完了後、再度このシグナル確認を行う
- **シグナルが空または存在しない**（出力が空）→ コンテキスト圧縮等でシグナル書き込みが漏れた可能性がある。以下の回復処理を行う:
  1. `git branch --show-current` で現在のブランチ名を確認する
  2. `gh pr list --head <ブランチ名> --state open --json number` で PR の存在を確認する
  - PR が存在する → `DONE` として扱い、次へ進む。「⚠️ イテレーション <iteration>: シグナルが未作成でしたが PR が確認できたため DONE として続行します。（Claude Code バグ #17688 によりエージェント frontmatter の Stop フックがサブエージェントに適用されないため、シグナル書き忘れが発生することがあります）」と表示する
  - PR が存在しない → 「⚠️ イテレーション <iteration> が結果を残さず終了しました（異常終了の可能性）。安全のためループを終了します。」と表示してループを終了する
- `DONE` → 正常完了。次へ進む

---

### ユーザーへの質問（NEEDS_INPUT 処理）

`AskUserQuestion` はサブエージェントからは使えないため、質問はこのメインセッションが代行する。

1. Read ツールで `.issue-loop/questions.md` を読む（存在しない場合は異常。「⚠️ NEEDS_INPUT が返りましたが質問が見つかりません。安全のためループを終了します。」と表示してループを終了する）
2. フロントマターの `issue:` フィールドから Issue 番号を取得し、「⚠️ Issue #<number> の実装に必要な情報が不足しています。以下の質問に回答してください。」とテキストで表示する
3. `questions.md` の各質問（`question` / `header` / `multiSelect` / 選択肢）を `AskUserQuestion` ツールの形式に変換し、まとめて質問する
4. 得られた回答を Write ツールで `.issue-loop/answers.md` に書き出す（形式は下記）
5. `rm -f .issue-loop/iteration-signal` でシグナルをクリアする
6. Agent ツールで `issue-loop:iteration` サブエージェントを**再起動**する。
   - prompt: "イテレーションを実行してください。MAX_REVIEW_ITERATIONS = <MAX_REVIEW_ITERATIONS>, RESUME = true"
   - **iteration カウントは増やさない**（同じ Issue の続きを実行するため）

`answers.md` の形式:

```markdown
---
issue: <number>
---
- <質問文>: <ユーザーの回答>
- <質問文>: <ユーザーの回答>
```

---

### イテレーション完了

「✅ イテレーション <iteration> 完了」と表示する。iteration を increment する。

---

## ループ終了後

以下を表示する:

```
🏁 Issue loop が完了しました。
  実行イテレーション数: <完了したイテレーション数>
```

Agent ツールで `issue-loop:result-dashboard` サブエージェントを起動し、今回の実行結果ダッシュボードを表示する。

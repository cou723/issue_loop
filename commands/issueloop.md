---
description: "Issue-loop を開始する。サブエージェントをネストして Issue の選定から実装・レビュー・PR作成までループする"
argument-hint: "[--max-iterations N] [--max-review-iterations N]"
allowed-tools: ["Read", "Write", "Edit(.gitignore)", "Bash(mkdir -p .issue-loop)", "Bash(git checkout -b *)", "Bash(test -f .issue-loop/cancel-requested)", "Bash(rm -f .issue-loop/cancel-requested)", "Bash(rm -f .issue-loop/out-of-scope.md)", "Agent", "Skill"]
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

## セットアップ

1. `mkdir -p .issue-loop` を実行する
2. Write ツールで `.issue-loop/pr-sync-gather.sh` を以下の内容で作成する（`${CLAUDE_PLUGIN_ROOT}` はスキル読み込み時に実パスへ置換済み）:
   ```
   #!/bin/bash
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/pr-sync-gather.sh" "$@"
   ```
3. Read ツールで `.gitignore` を読み、`.issue-loop*` が含まれていなければ末尾に追記する
4. `rm -f .issue-loop/cancel-requested` を実行してキャンセルフラグをリセットする

## 開始メッセージ

以下を表示する（値を実際に置換する）:

```
🔄 Issue loop を開始しました！

  最大イテレーション数: <MAX_ITERATIONS>
  最大レビュー回数/イテレーション: <MAX_REVIEW_ITERATIONS>

  中断するには /issue-loop:cancel を実行してください。
```

## ループ

iteration = 1 から始め MAX_ITERATIONS 回を上限に以下を繰り返す。上限超過時は「🛑 最大イテレーション数 (<MAX_ITERATIONS>) に達しました。」と表示して終了する。

---

### イテレーション開始

「🔄 イテレーション <iteration> / <MAX_ITERATIONS> を開始します」と表示する。

`test -f .issue-loop/cancel-requested && echo CANCEL || echo OK` を実行し、CANCEL なら「🛑 キャンセルリクエストを受け付けました。」と表示してループを終了する。

---

### ステップ 1: PR同期

Agent ツールで `issue-loop:pr-sync` サブエージェントを起動する。
- prompt: "PR 同期を実行してください"

---

### ステップ 2: Issue選定

Agent ツールで `issue-loop:pick-issue` サブエージェントを起動する。
- prompt: "取り組む Issue を選定してください"

---

### ステップ 3: Issue確認

Read ツールで `.issue-loop/current-issue.md` を読む。

フロントマターに `title: "NO_ISSUE"` が含まれる場合:
- 「✅ 取り組む Issue がなくなりました。ループを終了します。」と表示する
- ループを終了する

---

### ステップ 4: 情報収集

Agent ツールで `issue-loop:info-gathering` サブエージェントを起動する。
- prompt: "Issue の不足情報を収集してください"

---

### ステップ 5: Issue分類

Agent ツールで `issue-loop:pattern` サブエージェントを起動する。
- prompt: "Issue のタイプを分類してください"

---

### ステップ 6: ブランチ作成

Read ツールで `.issue-loop/current-issue.md` を読み、Issue 番号とタイトルを取得する。ブランチ名を `issue-<番号>-<kebab-case-slug>` 形式で決定する（タイトルから英数字・ハイフンのみ使用、スペースはハイフンに変換）。

`git checkout -b <ブランチ名>` を実行する。

`rm -f .issue-loop/out-of-scope.md` を実行して前イテレーションの残骸をクリアする。

---

### ステップ 7: 実装・レビューループ

review_count = 0 とする。

以下を繰り返す（上限: MAX_REVIEW_ITERATIONS）:

#### a. 実装またはデバッグ

Read ツールで `.issue-loop/next-action.md` を読む。

- `implement` → Agent ツールで `issue-loop:implement` サブエージェントを起動する（prompt: "Issue を実装してください"）
- `debug` → Agent ツールで `issue-loop:debug` サブエージェントを起動する（prompt: "バグを修正してください"）

#### b. レビュー

Agent ツールで `issue-loop:review` サブエージェントを起動する。
- prompt: "変更内容をレビューしてください"

#### c. 結果確認

Read ツールで `.issue-loop/review-result.md` を読む。

- `status: pass` → 「✅ レビュー通過」と表示してループを脱出する
- `status: fail` かつ review_count + 1 < MAX_REVIEW_ITERATIONS → 「🔁 レビュー指摘あり、修正して再レビューします（<review_count+1> / <MAX_REVIEW_ITERATIONS>）」と表示して review_count++ して **a** に戻る
- 上限到達 → 「⚠️ レビュー上限に達しました。PR作成に進みます。」と表示してループを脱出する

---

### ステップ 8: Issue更新

Agent ツールで `issue-loop:issue-update` サブエージェントを起動する。
- prompt: "スコープ外の発見事項を Issue として登録してください"

---

### ステップ 9: PR作成

Skill ツールで `issue-loop:push-and-pr` スキルを実行する。

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

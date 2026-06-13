---
description: "Issue-loop を開始する。サブエージェントをネストして Issue の選定から実装・レビュー・PR作成までループする"
argument-hint: "[--max-iterations N] [--max-review-iterations N] [--interactive]"
allowed-tools: ["Bash(bash *setup-issue-loop.sh)", "Bash(test -f .issue-loop/cancel-requested)", "Bash(rm -f .issue-loop/iteration-signal)", "Bash(grep * .issue-loop/iteration-signal)", "Agent"]
---

# Issue Loop

## 引数の解釈

`$ARGUMENTS` から以下の値を解釈する（不明なオプションは無視する）:

- `--max-iterations N` → MAX_ITERATIONS = N（デフォルト: 20）
- `--max-review-iterations N` → MAX_REVIEW_ITERATIONS = N（デフォルト: 3）
- `--interactive` → INTERACTIVE = true（デフォルト: false）。情報不足時にユーザーへ質問する
- `-h` / `--help` → 以下を表示して終了:

```
issue-loop - GitHub Issue ベースの自動開発ループ

USAGE:
  /issue-loop:issueloop [OPTIONS]

OPTIONS:
  --max-iterations N          最大イテレーション数（デフォルト: 20）
  --max-review-iterations N   1イテレーション内の最大レビュー回数（デフォルト: 3）
  --interactive               情報不足時にユーザーへ質問する（デフォルト: 無人実行）

STOPPING:
  /issue-loop:cancel でループを中断できます
  Issue がなくなった時点で自動終了します
```

INTERACTIVE が false（デフォルト）の場合、ループは完全に無人で動作し、情報不足の Issue でも質問せず利用可能な情報のみで進める。

## セットアップ

`bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup-issue-loop.sh"` を実行する。

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

### イテレーション実行

`rm -f .issue-loop/iteration-signal` を実行し、前イテレーションのシグナルをクリアする（クラッシュ時に古いシグナルを誤読しないため）。

Agent ツールで `issue-loop:iteration` サブエージェントを起動する。
- prompt: "イテレーションを実行してください。MAX_REVIEW_ITERATIONS = <MAX_REVIEW_ITERATIONS>, INTERACTIVE = <INTERACTIVE>"

---

### シグナル確認

`grep -s "" .issue-loop/iteration-signal` を実行してシグナルを確認する。

- `NO_ISSUE` → 「✅ 取り組む Issue がなくなりました。ループを終了します。」と表示してループを終了する
- `CANCELLED` → 「🛑 キャンセルリクエストを受け付けました。」と表示してループを終了する
- `FAILED` → 「❌ イテレーション <iteration> が失敗しました。安全のためループを終了します。`.issue-loop/` の状態を確認してください。」と表示してループを終了する
- **シグナルが空または存在しない**（出力が空）→ サブエージェントが結果を残さず終了した（異常終了の可能性）。「⚠️ イテレーション <iteration> が結果を残さず終了しました（異常終了の可能性）。安全のためループを終了します。」と表示してループを終了する
- `DONE` → 正常完了。次へ進む

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

#!/bin/bash

# Issue Loop Setup Script

set -euo pipefail

MAX_ITERATIONS=20
MAX_REVIEW_ITERATIONS=3

while [[ $# -gt 0 ]]; do
  case $1 in
    --max-iterations)
      if ! [[ "${2:-}" =~ ^[0-9]+$ ]]; then
        echo "❌ --max-iterations には正の整数を指定してください" >&2
        exit 1
      fi
      MAX_ITERATIONS="$2"; shift 2 ;;
    --max-review-iterations)
      if ! [[ "${2:-}" =~ ^[0-9]+$ ]]; then
        echo "❌ --max-review-iterations には正の整数を指定してください" >&2
        exit 1
      fi
      MAX_REVIEW_ITERATIONS="$2"; shift 2 ;;
    -h|--help)
      cat << 'HELP'
issue-loop - GitHub Issue ベースの自動開発ループ

USAGE:
  /issue-loop:issueloop [OPTIONS]

OPTIONS:
  --max-iterations N          最大イテレーション数（デフォルト: 20）
  --max-review-iterations N   1イテレーション内の最大レビュー回数（デフォルト: 3）
  -h, --help                  このヘルプを表示

STOPPING:
  /issue-loop:cancel でループを中断できます
  Issue がなくなった時点で自動終了します
HELP
      exit 0 ;;
    *)
      echo "⚠️  不明なオプション: $1" >&2
      shift ;;
  esac
done

STATE_FILE=".claude/issue-loop.local.md"

if [[ -f "$STATE_FILE" ]]; then
  echo "⚠️  既にアクティブな issue-loop があります。"
  echo "   /issue-loop:cancel で停止してから再度実行してください。"
  exit 1
fi

mkdir -p .claude/issue-loop

# Write the iteration instructions file
cat > .claude/issue-loop/iteration-prompt.md << 'ITERATION_PROMPT_EOF'
# Issue Loop - 1イテレーション実行

`.claude/issue-loop.local.md` から `max_review_iterations` の値を取得して使用する。
エラーが発生した場合は `gh issue comment <number> --body "自動化失敗: <理由>"` を実行して次のステップへ進む。

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
ITERATION_PROMPT_EOF

# Write state file
cat > "$STATE_FILE" << EOF
---
iteration: 1
max_iterations: $MAX_ITERATIONS
max_review_iterations: $MAX_REVIEW_ITERATIONS
session_id: ${CLAUDE_CODE_SESSION_ID:-}
status: active
---

\`.claude/issue-loop/iteration-prompt.md\` を読み、指示に従って1イテレーションを実行せよ。
EOF

echo "🔄 Issue loop を開始しました！"
echo ""
echo "  最大イテレーション数: $(if [[ $MAX_ITERATIONS -gt 0 ]]; then echo $MAX_ITERATIONS; else echo '無制限'; fi)"
echo "  最大レビュー回数/イテレーション: $MAX_REVIEW_ITERATIONS"
echo ""
echo "  中断するには /issue-loop:cancel を実行してください。"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
cat .claude/issue-loop/iteration-prompt.md

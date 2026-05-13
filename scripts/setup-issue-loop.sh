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

Agent ツール（subagent_type: "claude"）を使用して以下のエージェントを起動する:

---
GitHub からこのリポジトリのオープン Issue を取得し、最優先で取り組むべき Issue を1つ選んで `.claude/issue-loop/current-issue.md` に書き出せ。

手順:
1. `gh issue list --state open --limit 50 --json number,title,body,labels,milestone` で一覧取得
2. `gh pr list --state open --json number,title,headRefName` で既存PR取得
3. Issue本文内の "depends on #N"、"blocked by #N" の依存関係を確認し、依存先が未解決なら除外
4. 既存PRが紐づくIssueは除外
5. マイルストーン優先度・ラベル・番号順で最優先Issueを1つ選ぶ
6. Issue が見つからない場合は以下を書き出す:
   ---
   number: 0
   title: "NO_ISSUE"
   type: ""
   ---
7. Issue が見つかった場合は以下を書き出す:
   ---
   number: <番号>
   title: "<タイトル>"
   type: ""
   ---
   <Issue の本文>
---

## ステップ 2: Issue 確認

`.claude/issue-loop/current-issue.md` を読む。
`title: "NO_ISSUE"` の場合:
- `.claude/issue-loop.local.md` を読み、フロントマターの `status: active` を `status: done` に変更して保存する
- 処理を終了する（Stop hook がループを終了させる）

## ステップ 3: 情報収集

Agent ツールを使用して以下のエージェントを起動する:

---
`.claude/issue-loop/current-issue.md` を読み、Issue 実装に必要な情報が揃っているか確認せよ。

不足している情報（受け入れ条件、技術的制約、対象範囲など）がある場合は `AskUserQuestion` ツールで同期的にユーザーへ質問する。
収集した情報を `gh issue comment <number> --body "<内容>"` でコメントとして追記する。
`.claude/issue-loop/current-issue.md` の本文末尾に収集情報を追記する。

情報が十分な場合はそのまま終了する。
---

## ステップ 4: Issue 分類

Agent ツールを使用して以下のエージェントを起動する:

---
`.claude/issue-loop/current-issue.md` を読み、Issue のタイプを分類せよ。

分類基準:
- Feature: 新機能の追加・既存機能の拡張
- Debug: バグ修正・不具合対応
- Refactor: コード品質改善（機能変更なし）
- Test: テストの追加・修正

`.claude/issue-loop/current-issue.md` のフロントマターの `type:` を分類結果に更新する。
`.claude/issue-loop/next-action.md` に以下を書き出す:
- Debug タイプ → `debug` と記載
- それ以外 → `implement` と記載
---

## ステップ 5: ブランチ作成

`.claude/issue-loop/current-issue.md` を読んでIssue番号とタイトルを取得する。
ブランチ名を `issue-<番号>-<kebab-case-slug>` 形式で決定する（タイトルから英数字・ハイフンのみ使用）。
`git checkout -b <ブランチ名>` を実行する。

## ステップ 6: 実装またはデバッグ

`.claude/issue-loop/next-action.md` を読む。
`.claude/issue-loop/out-of-scope.md` が存在する場合は空にしてリセットする。

**`implement` の場合**: Agent ツールで以下のエージェントを起動:

---
`.claude/issue-loop/current-issue.md` を読み、記載されている内容を実装せよ。

`feature-dev:feature-dev` スキルを活用して実装する。
実装完了後、`pr-review-toolkit:code-simplifier` エージェントを使用してコードを整理する。

実装中に発見したスコープ外の問題（今回のIssueの範囲外だが将来対応すべきもの）を `.claude/issue-loop/out-of-scope.md` に追記する:
- <問題の概要>
---

**`debug` の場合**: Agent ツールで以下のエージェントを起動:

---
`.claude/issue-loop/current-issue.md` を読み、記載されているバグを修正せよ。

`feature-dev:code-explorer` エージェントを活用して問題の根本原因を特定する。
修正を実装し、再発防止策も検討する。

修正中に発見したスコープ外の問題を `.claude/issue-loop/out-of-scope.md` に追記する:
- <問題の概要>
---

## ステップ 7: レビューループ

`.claude/issue-loop.local.md` から `max_review_iterations` を読む。

最大 `max_review_iterations` 回、以下を繰り返す:

**a. レビュー実行**

以下の7つのエージェントを Agent ツールで並列起動する。各エージェントの subagent_type を必ず指定すること:

エージェント1 - コメントレビュー（subagent_type: "pr-review-toolkit:comment-analyzer"）:
---
`git diff main` で変更内容を確認し、コードコメントの妥当性をレビューせよ。
ファイル冒頭以外のコメントは「Why（なぜ）」のみを書く方針に沿っているか確認する。
「What（何をしているか）」を説明するコメントは不要なので指摘する。
結果を {"scope_in": [...], "scope_out": [...]} 形式で返す。
---

エージェント2 - 設計レビュー（subagent_type: "feature-dev:code-reviewer"）:
---
`git diff main` で変更内容を確認し、設計の妥当性をレビューせよ。
既存コードパターンとの整合性、将来的な肥大化リスク、過剰な抽象化がないか確認する。
結果を {"scope_in": [...], "scope_out": [...]} 形式で返す。
---

エージェント3 - 型安全性レビュー（subagent_type: "issue-loop:type-safety-reviewer"）:
---
`git diff main` で変更内容を確認し、TypeScript の型安全性をレビューせよ。
`as` キャスト・`any` 型・`@ts-ignore` などの型抑制コメントの使用が正当か確認する。
lint や型チェッカー抑制コメントに理由が明記されているか確認する。
結果を {"scope_in": [...], "scope_out": [...]} 形式で返す。
---

エージェント4 - セキュリティレビュー（subagent_type: "issue-loop:security-reviewer"）:
---
`git diff main` で変更内容を確認し、セキュリティ上の問題をレビューせよ（OWASP Top 10 相当）。
インジェクション・認証バイパス・機密情報の漏洩などを確認する。
結果を {"scope_in": [...], "scope_out": [...]} 形式で返す。
---

エージェント5 - テストレビュー（subagent_type: "pr-review-toolkit:pr-test-analyzer"）:
---
`git diff main` で変更内容を確認し、テストカバレッジをレビューせよ。
既存テストへの影響、新しいロジックに対応するテストが存在するかを確認する。
結果を {"scope_in": [...], "scope_out": [...]} 形式で返す。
---

エージェント6 - エラーハンドリングレビュー（subagent_type: "pr-review-toolkit:silent-failure-hunter"）:
---
`git diff main` で変更内容を確認し、エラーハンドリングをレビューせよ。
例外の握りつぶし・silent failures・不適切なフォールバックがないか確認する。
結果を {"scope_in": [...], "scope_out": [...]} 形式で返す。
---

エージェント7 - パフォーマンスレビュー（subagent_type: "issue-loop:performance-reviewer"）:
---
`git diff main` で変更内容を確認し、パフォーマンス上の問題をレビューせよ。
N+1クエリ・不要なループ・明らかな非効率を確認する。
結果を {"scope_in": [...], "scope_out": [...]} 形式で返す。
---

**b. 結果集約**

全エージェントの結果を集約して `.claude/issue-loop/review-result.md` を書き出す:
```
---
status: pass | fail
next-action: implement | debug
---
## スコープ内の指摘（今回修正する）
- ...

## スコープ外の指摘（Issue 登録対象）
- ...
```

判定基準: スコープ内の指摘が1件以上 → `fail`、0件 → `pass`
スコープ外の指摘は `.claude/issue-loop/out-of-scope.md` に追記する。

**c. 継続判定**

- `status: pass` → ループを抜ける
- `status: fail` かつ上限未到達 → ステップ 6 と同じ種類のエージェントを再起動して修正（`review-result.md` のスコープ内指摘を参照して修正点を伝える）
- 上限到達 → ループを抜ける（passでなくても終了）

## ステップ 8: Issue 更新

Agent ツールで以下のエージェントを起動する:

---
`.claude/issue-loop/out-of-scope.md` を読み、スコープ外の問題を GitHub Issue として登録せよ。

手順:
1. `gh issue list --state open --limit 100 --json number,title,body` で既存Issue取得
2. out-of-scope.md が空、またはファイルが存在しない場合は終了
3. 各項目について既存Issueと内容が重複していないか確認
4. 重複しない項目を `gh issue create --title "<タイトル>" --body "<詳細>"` で登録
---

## ステップ 9: PR 作成

`commit-commands:commit-push-pr` スキルを使用してコミット・プッシュ・PR作成を一括実行する。
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

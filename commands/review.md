---
description: "複数の専門エージェントを並列実行して変更内容をレビューし、結果を review-result.md に書き出す"
allowed-tools: ["Bash(git diff:*)", "Read", "Glob", "Grep", "Task", "Agent", "Write(.claude/issue-loop/review-result.md)", "Write(.claude/issue-loop/out-of-scope.md)"]
---

# Review

変更内容に対して以下の7つのレビューエージェントを Agent ツールで**並列**起動し、結果を集約して `.claude/issue-loop/review-result.md` に書き出せ。

## レビューエージェント（並列実行）

各エージェントは `subagent_type` を以下の通り指定して起動すること。

**1. コメントレビュー** — `subagent_type: "pr-review-toolkit:comment-analyzer"`
`git diff main` で変更を確認し、コードコメントの妥当性をレビューせよ。ファイル冒頭以外では「Why（なぜ）」のみを書く方針に沿っているか確認する。What（何をしているか）を説明するコメントは不要。結果を `{"scope_in": [...], "scope_out": [...]}` JSON形式で返す。

**2. 設計レビュー** — `subagent_type: "feature-dev:code-reviewer"`
`git diff main` で変更を確認し、設計の妥当性をレビューせよ。既存パターンとの整合性、将来的な肥大化リスク、過剰抽象化がないか確認する。結果を `{"scope_in": [...], "scope_out": [...]}` JSON形式で返す。

**3. 型安全性レビュー** — `subagent_type: "issue-loop:type-safety-reviewer"`
`git diff main` で変更を確認し、型安全性をレビューせよ。`as` キャスト・`any` 型・`@ts-ignore` などの型抑制の使用が正当か確認する。lint抑制コメントに理由が明記されているか確認する。結果を `{"scope_in": [...], "scope_out": [...]}` JSON形式で返す。

**4. セキュリティレビュー** — `subagent_type: "issue-loop:security-reviewer"`
`git diff main` で変更を確認し、セキュリティ上の問題をレビューせよ（OWASP Top 10 相当）。インジェクション・認証バイパス・機密情報漏洩などを確認する。結果を `{"scope_in": [...], "scope_out": [...]}` JSON形式で返す。

**5. テストレビュー** — `subagent_type: "pr-review-toolkit:pr-test-analyzer"`
`git diff main` で変更を確認し、テストカバレッジをレビューせよ。既存テストへの影響、新しいロジックに対応するテストが存在するか確認する。結果を `{"scope_in": [...], "scope_out": [...]}` JSON形式で返す。

**6. エラーハンドリングレビュー** — `subagent_type: "pr-review-toolkit:silent-failure-hunter"`
`git diff main` で変更を確認し、エラーハンドリングをレビューせよ。例外の握りつぶし・silent failures・不適切なフォールバックがないか確認する。結果を `{"scope_in": [...], "scope_out": [...]}` JSON形式で返す。

**7. パフォーマンスレビュー** — `subagent_type: "issue-loop:performance-reviewer"`
`git diff main` で変更を確認し、パフォーマンス上の問題をレビューせよ。N+1クエリ・不要なループ・明らかな非効率を確認する。結果を `{"scope_in": [...], "scope_out": [...]}` JSON形式で返す。

## 結果集約

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

判定: スコープ内の指摘が1件以上 → `status: fail`、0件 → `status: pass`
`next-action` は `.claude/issue-loop/next-action.md` の値を引き継ぐ。
スコープ外の指摘は `.claude/issue-loop/out-of-scope.md` にも追記する。

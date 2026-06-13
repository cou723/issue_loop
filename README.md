# issue-loop

GitHub Issue ベースの自動開発ループを実現する Claude Code プラグイン。Issue を自動選定し、実装・レビュー・PR 作成までをループして実行し続ける。

## 前提条件

- [Claude Code](https://claude.ai/code)
- [GitHub CLI](https://cli.github.com/)（`gh auth login` 済み）
- GitHub リポジトリ（Issue が登録済み）

### 必要な外部プラグイン

`review` ステップが以下のプラグインのエージェントを利用します。事前にインストールしてください。

- `pr-review-toolkit`（`comment-analyzer`, `pr-test-analyzer`, `silent-failure-hunter`, `code-simplifier`）
- `feature-dev`（`code-explorer`, `code-reviewer`）

## セットアップ

各スキルを `~/.claude/skills/` にシンボリックリンクする:

```bash
PLUGIN_DIR="$(pwd)"
for f in commands/*.md; do
  skill=$(basename "$f" .md)
  ln -s "$PLUGIN_DIR/$f" ~/.claude/skills/issue-loop:${skill}.md
done
```

## 使い方

対象プロジェクトのルートで実行する:

```
/issue-loop:issueloop
```

| オプション | 説明 | デフォルト |
|---|---|---|
| `--max-iterations N` | 最大イテレーション数 | 20 |
| `--max-review-iterations N` | 1イテレーション内の最大レビュー回数 | 3 |
| `--interactive` | 情報不足時にユーザーへ質問する（無指定時は完全無人で実行） | 無効 |

ループを中断するには:

```
/issue-loop:cancel
```

### パーミッション設定

プラグインの実行には **`acceptEdits` モード**（または同等の権限設定）が必要です。

対象プロジェクトの `.claude/settings.local.json` に以下を追加してください:

```json
{
  "permissions": {
    "allow": [
      "Bash(bash *pr-sync-gather.sh*)",
      "Bash(test -f .issue-loop/cancel-requested)",
      "Bash(rm .issue-loop/cancel-requested)",
      "Bash(rm -f .issue-loop/out-of-scope.md)",
      "Bash(rm -f .issue-loop/review-result.md)",
      "Bash(rm -f .issue-loop/iteration-signal)",
      "Bash(git checkout -b *)",
      "Bash(git checkout main)",
      "Bash(git pull *)",
      "Bash(git branch *)",
      "Bash(gh issue list *)",
      "Bash(gh issue view *)",
      "Bash(gh issue create *)",
      "Bash(gh issue comment *)",
      "Bash(gh pr list *)",
      "Bash(gh pr view *)",
      "Bash(gh pr comment *)"
    ]
  }
}
```

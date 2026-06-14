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

### プラグインのインストール

Claude Code のマーケットプレイスからインストールするか、開発中はローカルデプロイスクリプトを使用する。

**ローカル開発用**（`my-room` で `/install-plugin` 実行済みの場合）:

```bash
bash scripts/deploy-local.sh
```

このスクリプトはプラグインキャッシュへの同期と `installed_plugins.json` の更新を行う。

## 使い方

対象プロジェクトのルートで実行する:

```
/issue-loop:issueloop
```

| オプション | 説明 | デフォルト |
|---|---|---|
| `--max-iterations N` | 最大イテレーション数 | 20 |
| `--max-review-iterations N` | 1イテレーション内の最大レビュー回数 | 3 |

Issue の情報が不足している場合はループを一時停止し、ユーザーへ質問してから実装を続行します（有人実行）。

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
      "Bash(bash *setup-issue-loop.sh)",
      "Bash(bash *pr-sync-gather.sh*)",
      "Bash(test -f .issue-loop/cancel-requested)",
      "Bash(test -d .issue-loop)",
      "Bash(touch .issue-loop/cancel-requested)",
      "Bash(grep * .issue-loop/iteration-signal)",
      "Bash(rm -f .issue-loop/cancel-requested)",
      "Bash(rm -f .issue-loop/out-of-scope.md)",
      "Bash(rm -f .issue-loop/review-result.md)",
      "Bash(rm -f .issue-loop/iteration-signal)",
      "Bash(rm -f .issue-loop/questions.md)",
      "Bash(rm -f .issue-loop/answers.md)",
      "Bash(test -f .issue-loop/questions.md)",
      "Bash(git add *)",
      "Bash(git diff *)",
      "Bash(git commit *)",
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
      "Bash(gh pr comment *)",
      "Bash(gh repo view *)",
      "Bash(curl *)",
      "Bash(mkdir -p *)",
      "Bash(base64 *)"
    ]
  }
}
```

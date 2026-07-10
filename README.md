# issue-loop

GitHub Issue ベースの自動開発ループを実現する Claude Code プラグイン。Issue を自動選定し、実装・レビュー・PR 作成までをループして実行し続ける。

## 前提条件

- [Claude Code](https://claude.ai/code)
- [GitHub CLI](https://cli.github.com/)（`gh auth login` 済み）
- [jq](https://jqlang.github.io/jq/)（PR 差分収集スクリプトが使用）
- GitHub リポジトリ（Issue が登録済み）

### 必要な外部プラグイン

`review` ステップが以下のプラグインのエージェントを利用します。事前にインストールしてください。

- `pr-review-toolkit`（`comment-analyzer`, `pr-test-analyzer`, `silent-failure-hunter`, `code-simplifier`）
- `feature-dev`（`code-explorer`）

## セットアップ

### プラグインのインストール

Claude Code のマーケットプレイスからインストールするか、開発中は skills-directory plugin として直接読み込ませる。

**ローカル開発用**:

```bash
ln -s "$(pwd)" ~/.claude/skills/issue-loop
```

`.claude-plugin/plugin.json` を持つディレクトリを `~/.claude/skills/` にシンボリックリンクすると、キャッシュへのコピーなしにリポジトリを直接 `issue-loop@skills-dir` として読み込む。詳細は [CLAUDE.md](./CLAUDE.md) を参照。

## 使い方

対象プロジェクトのルートで実行する:

```
/issue-loop:issueloop
```

| オプション | 説明 | デフォルト |
|---|---|---|
| `--max-iterations N`, `-mi N` | 最大イテレーション数 | 20 |
| `--max-review-iterations N` | 1イテレーション内の最大レビュー回数 | 3 |
| `--comment TEXT`, `-c TEXT` | Issue 選定時の追加基準 | なし |

Issue の情報が不足している場合はループを一時停止し、ユーザーへ質問してから実装を続行します（有人実行）。

ループを中断するには:

```
/issue-loop:cancel
```

### その他のコマンド

| コマンド | 説明 |
|---|---|
| `/issue-loop:close-issues [N]` | 最新 N 件（デフォルト: 3）のマージ済み PR を対象に、解決済みのオープン Issue を一括クローズする |
| `/issue-loop:push-and-pr` | 現在の変更をコミット・プッシュして PR を作成する（ループ内から自動で呼ばれるが単体でも使用可） |

`push-and-pr` のスクリーンショット撮影条件（監視パス・開発サーバーURL）は、対象プロジェクトの `.claude/issue-loop.local.md` の YAML フロントマターで上書きできる（`screenshot-watch-path` / `screenshot-url`）。未設定の場合はそれぞれ `apps/web/src/` / `http://localhost:5173/` がデフォルト値として使われる。

### パーミッション設定

プラグインの実行には **`acceptEdits` モード**（または同等の権限設定）が必要です。

対象プロジェクトの `.claude/settings.local.json` に以下を追加してください:

```json
{
  "permissions": {
    "allow": [
      "Bash(bash *setup-issue-loop.sh)",
      "Bash(bash *pr-sync-gather.sh*)",
      "Bash(bash .issue-loop/ci.sh)",
      "Bash(chmod +x .issue-loop/ci.sh)",
      "Bash(test -d .issue-loop)",
      "Bash(test -f .issue-loop/*)",
      "Bash(touch .issue-loop/cancel-requested)",
      "Bash(grep * .issue-loop/iteration-signal)",
      "Bash(rm -f .issue-loop/*)",
      "Bash(rm -rf .issue-loop/close-check)",
      "Bash(ls .issue-loop/close-check*)",
      "Bash(cat .issue-loop/close-check/*)",
      "Bash(python3 .issue-loop/analyze-results.py)",
      "Bash(mkdir -p *)",
      "Bash(git add *)",
      "Bash(git diff *)",
      "Bash(git commit *)",
      "Bash(git checkout -b *)",
      "Bash(git checkout main)",
      "Bash(git pull *)",
      "Bash(git push *)",
      "Bash(git branch *)",
      "Bash(gh issue list *)",
      "Bash(gh issue view *)",
      "Bash(gh issue create *)",
      "Bash(gh issue comment *)",
      "Bash(gh issue close *)",
      "Bash(gh pr list *)",
      "Bash(gh pr view *)",
      "Bash(gh pr create *)",
      "Bash(gh pr comment *)",
      "Bash(gh pr close *)",
      "Bash(gh repo view *)",
      "Bash(curl *)",
      "Bash(echo *)",
      "Bash(base64 *)"
    ]
  }
}
```

このほか、`implement` / `debug` エージェントはテスト実行など任意のコマンドを実行しうるため、プロジェクトのビルド・テストコマンドも必要に応じて許可してください。

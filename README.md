# issue-loop

GitHub Issue ベースの自動開発ループを実現する Claude Code プラグイン。Issue を自動選定し、実装・レビュー・PR 作成までをループして実行し続ける。

## 前提条件

- [Claude Code](https://claude.ai/code)
- [GitHub CLI](https://cli.github.com/)（`gh auth login` 済み）
- GitHub リポジトリ（Issue が登録済み）

## セットアップ

### ローカル開発

各スキルを `~/.claude/skills/` にシンボリックリンクする:

```bash
PLUGIN_DIR="$(pwd)"
for f in commands/*.md; do
  skill=$(basename "$f" .md)
  ln -s "$PLUGIN_DIR/$f" ~/.claude/skills/issue-loop:${skill}.md
done
```

Stop hook を `~/.claude/settings.json` の `hooks` セクションに追加する:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"/absolute/path/to/issue-loop/hooks/stop-hook.sh\""
          }
        ]
      }
    ]
  }
}
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

ループを中断するには:

```
/issue-loop:cancel
```

## dontask モードの設定

確認プロンプトなしで自動実行するには、対象プロジェクトの `.claude/settings.json` に以下を追加する:

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep",
      "Agent",
      "Task",
      "Skill",
      "Bash(git *)",
      "Bash(gh issue *)",
      "Bash(gh pr *)",
      "Bash(gh repo *)",
      "Bash(bash scripts/pr-sync-gather.sh)",
      "Bash(bash hooks/stop-hook.sh)",
      "Bash(mkdir -p *)",
      "Bash(test -f *)",
      "Bash(echo *)",
      "Bash(curl *)",
      "mcp__plugin_playwright_playwright__browser_navigate",
      "mcp__plugin_playwright_playwright__browser_take_screenshot",
      "mcp__plugin_playwright_playwright__browser_close"
    ]
  }
}
```

実装・デバッグフェーズでは任意の Bash コマンドが実行される。完全に無制限にする場合は Bash 関連の項目をすべて `"Bash(*)"` 1行に置き換える。

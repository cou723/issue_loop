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


# issue-loop plugin

Claude Code プラグインの開発リポジトリ。

## ローカルテスト

開発中のスキルを即時テストするには、`commands/` 内のファイルを `~/.claude/skills/` にシンボリックリンクする。

```bash
ln -s "$(pwd)/commands/<skill>.md" ~/.claude/skills/issue-loop:<skill>.md
```

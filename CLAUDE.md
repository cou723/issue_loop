# issue-loop plugin

Claude Code プラグインの開発リポジトリ。

## ローカルテスト

このリポジトリには `.claude-plugin/plugin.json` があるため、[skills-directory plugin](https://code.claude.com/docs/en/plugins-reference#skills-directory-plugins) としてリポジトリを直接読み込ませられる。マーケットプレイス経由のインストール（`~/.claude/plugins/cache/` へのコピー）と異なり、キャッシュを経由せずその場のファイルを直接参照するため、デプロイ操作が不要になる。

初回のみ、リポジトリ自体を `~/.claude/skills/issue-loop` にシンボリックリンクする（`issue-loop@skills-dir` として全プロジェクトで常時ロードされる）。

```bash
ln -s "$(pwd)" ~/.claude/skills/issue-loop
```

以降:

- `commands/`（skills）の変更は次のプロンプトから即時反映される
- `agents/`・`hooks/` などの変更は `/reload-plugins` 実行またはセッション再起動が必要

他プロジェクトのマーケットプレイス経由インストール（`issue-loop@issue-loop`）と名前が競合すると skills-dir 版がロードされないため、ローカルテスト中はそちらを `claude plugin uninstall issue-loop@issue-loop` などで無効化しておくこと。

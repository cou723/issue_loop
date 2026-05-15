---
description: "現在の変更をコミット・プッシュして PR を作成する"
allowed-tools: ["Skill(commit-commands:commit-push-pr)", "Bash(git add *)", "Bash(git status *)", "Bash(git diff *)", "Bash(git commit *)", "Bash(git push *)", "Bash(git branch *)", "Bash(git checkout --branch *)", "Bash(gh pr create *)", "Bash(gh pr comment *)", "Bash(gh repo view *)", "Bash(curl *)", "Bash(mkdir -p *)", "Bash(echo *)", "mcp__plugin_playwright_playwright__browser_navigate", "mcp__plugin_playwright_playwright__browser_take_screenshot", "mcp__plugin_playwright_playwright__browser_close"]
---

# Push and PR

## ステップ 1: スクリーンショット（UIの変更がある場合のみ）

以下の条件をすべて満たす場合のみスクリーンショットを撮影する。

**条件確認：**
- `git diff origin/main --name-only` を実行し、`apps/web/src/` 配下に変更があること
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/` が `200` を返すこと
  - 返ってこない場合は「開発サーバーが起動していないためスクリーンショットをスキップします」と表示してスキップ

**撮影・保存：**
1. `mcp__plugin_playwright_playwright__browser_navigate` で `http://localhost:5173/` を開く
2. `mcp__plugin_playwright_playwright__browser_take_screenshot` でスクリーンショットを撮影する（base64データを取得）
3. `mcp__plugin_playwright_playwright__browser_close` でブラウザを閉じる
4. `mkdir -p .claude/screenshots` を実行する
5. 取得した base64 データを `echo "<base64>" | base64 -d > .claude/screenshots/pr-ui.png` でファイルに保存する
6. `git add .claude/screenshots/ && git commit -m "docs: add UI screenshots for PR review"` でコミットする

## ステップ 2: コミット・プッシュ・PR作成

`commit-commands:commit-push-pr` スキルを実行してコミット・プッシュ・PR作成を一括実行する。

## ステップ 3: スクリーンショットをPRコメントとして投稿（ステップ1で撮影した場合のみ）

1. `gh repo view --json owner,name -q '.owner.login + "/" + .name'` でリポジトリ名を取得する
2. `git branch --show-current` で現在のブランチ名を取得する
3. 以下のコマンドでスクリーンショット画像をPRコメントとして投稿する：
   ```bash
   gh pr comment --body "## スクリーンショット

   ![UI screenshot](https://raw.githubusercontent.com/<owner>/<repo>/<branch>/.claude/screenshots/pr-ui.png)"
   ```

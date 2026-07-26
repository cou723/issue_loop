---
description: "現在の変更をコミット・プッシュして PR を作成する"
allowed-tools: ["Skill(commit-commands:commit-push-pr)", "Read", "Bash(git add *)", "Bash(git diff *)", "Bash(git commit *)", "Bash(git branch *)", "Bash(gh pr comment *)", "Bash(gh repo view *)", "Bash(curl *)", "Bash(mkdir -p *)", "Bash(echo *)", "Bash(base64 *)", "mcp__plugin_playwright_playwright__browser_navigate", "mcp__plugin_playwright_playwright__browser_take_screenshot", "mcp__plugin_playwright_playwright__browser_close"]
---

# Push and PR

## ステップ 1: スクリーンショット（UIの変更がある場合のみ）

### 実行条件（リポジトリの公開設定）

`gh repo view --json isPrivate -q '.isPrivate'` を実行する。`true`（private リポジトリ）の場合、本ステップおよびステップ3のスクリーンショット関連処理をすべてスキップする。

- 理由: ステップ3で使う `raw.githubusercontent.com` の画像URLは、private リポジトリでは認証なしでアクセスできず、PRコメント上で画像が表示されないため

以下、リポジトリが public の場合のみ続行する。

### 設定の読み込み

Read ツールで `.claude/issue-loop.local.md` を読む（存在しなければデフォルト値を使う）。フロントマターから以下を取得する:

- `screenshot-watch-path`（デフォルト: `apps/web/src/`）
- `screenshot-url`（デフォルト: `http://localhost:5173/`）

設定例:
```markdown
---
screenshot-watch-path: apps/web/src/
screenshot-url: http://localhost:5173/
---
```

以下、`<screenshot-watch-path>` / `<screenshot-url>` は上記で読み込んだ値を指す。

以下の条件をすべて満たす場合のみスクリーンショットを撮影する。

**条件確認：**
- `git diff origin/main --name-only` を実行し、`<screenshot-watch-path>` 配下に変更があること
- `curl -s -o /dev/null -w "%{http_code}" <screenshot-url>` が `200` を返すこと
  - 返ってこない場合は「開発サーバーが起動していないためスクリーンショットをスキップします」と表示してスキップ

**撮影・保存：**
1. `mcp__plugin_playwright_playwright__browser_navigate` で `<screenshot-url>` を開く
2. `mcp__plugin_playwright_playwright__browser_take_screenshot` でスクリーンショットを撮影する（base64データを取得）
3. `mcp__plugin_playwright_playwright__browser_close` でブラウザを閉じる
4. `mkdir -p .screenshots` を実行する
5. 取得した base64 データを `echo "<base64>" | base64 -d > .screenshots/pr-ui.png` でファイルに保存する
6. `git add .screenshots/ && git commit -m "docs: add UI screenshots for PR review"` でコミットする

## ステップ 2: コミット・プッシュ・PR作成

`commit-commands:commit-push-pr` スキルを実行してコミット・プッシュ・PR作成を一括実行する。

## ステップ 3: スクリーンショットをPRコメントとして投稿（ステップ1で撮影した場合のみ、private リポジトリではスキップ）

1. `gh repo view --json owner,name -q '.owner.login + "/" + .name'` でリポジトリ名を取得する
2. `git branch --show-current` で現在のブランチ名を取得する
3. 以下のコマンドでスクリーンショット画像をPRコメントとして投稿する：
   ```bash
   gh pr comment --body "## スクリーンショット

   ![UI screenshot](https://raw.githubusercontent.com/<owner>/<repo>/<branch>/.screenshots/pr-ui.png)"
   ```

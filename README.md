# issue-loop

GitHub Issue ベースの自動開発ループを実現する Claude Code プラグイン。Issue を自動選定し、実装・レビュー・PR 作成までをループして実行し続ける。

## 前提条件

- [Claude Code](https://claude.ai/code) v2.1.154+（dynamic workflow ランタイムを使用）
- [GitHub CLI](https://cli.github.com/)（`gh auth login` 済み）
- [jq](https://jqlang.github.io/jq/)（PR 差分収集スクリプトが使用）
- GitHub リポジトリ（Issue が登録済み）

### 必要な外部プラグイン

`implement` / `debug` ステップが以下のプラグインのエージェントを利用します。事前にインストールしてください。

- `pr-review-toolkit`（`code-simplifier`）
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

イテレーションの区切りでループを中断するには:

```
/issue-loop:cancel
```

実行中のイテレーション自体を止めるには `/workflows` ビューの停止操作を使います。

### その他のコマンド

| コマンド | 説明 |
|---|---|
| `/issue-loop:close-issues [N]` | 最新 N 件（デフォルト: 3）のマージ済み PR を対象に、解決済みのオープン Issue を一括クローズする |
| `/issue-loop:consolidate-issues` | オープン Issue から同種の細粒度 Issue を洗い出して統合する。統合案を承認してから実行される（ループ終了後にも自動で呼ばれる） |
| `/issue-loop:push-and-pr` | 現在の変更をコミット・プッシュして PR を作成する（ループ内から自動で呼ばれるが単体でも使用可） |

`push-and-pr` のスクリーンショット撮影条件（監視パス・開発サーバーURL）は、対象プロジェクトの `.claude/issue-loop.local.md` の YAML フロントマターで上書きできる（`screenshot-watch-path` / `screenshot-url`）。未設定の場合はそれぞれ `apps/web/src/` / `http://localhost:5173/` がデフォルト値として使われる。なお private リポジトリではスクリーンショット関連処理自体がスキップされる。

### パーミッション設定

ループは git / gh / 定型ファイル操作を無人で発行する。auto mode や bypassPermissions に頼らずに運用するには、これらのコマンドを `permissions.allow` に事前登録する。

workflow が起動するサブエージェントはセッションのモードに関係なく常に `acceptEdits` で動作し、settings の allowlist を継承する（[公式ドキュメント](https://code.claude.com/docs/en/workflows)）。したがってファイル編集の許可設定は不要で、**Bash ルールの整備だけでよい**。

ルールは性質で2層に分かれる:

1. **プラグイン共通**（どのプロジェクトでも同じ）: 下記の JSON。全プロジェクトで使うなら `~/.claude/settings.json`、プロジェクト単位なら対象プロジェクトの `.claude/settings.local.json` に置く
2. **プロジェクト固有**: `implement` / `debug` エージェントが使うビルド・テストコマンド（例: `Bash(pnpm *)`）。対象プロジェクト側に置く

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
      "Bash(cat .issue-loop/*)",
      "Bash(rm -f .issue-loop/*)",
      "Bash(rm -rf .issue-loop/close-check)",
      "Bash(ls .issue-loop/close-check*)",
      "Bash(python3 .issue-loop/analyze-results.py)",
      "Bash(mkdir -p *)",
      "Bash(git status*)",
      "Bash(git log *)",
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
    ],
    "deny": [
      "Bash(git push * --force*)",
      "Bash(git push --force*)"
    ]
  }
}
```

注意点:

- `git push` / `gh pr create` / `gh issue create` を allow に入れることは、**確認なしでの外部公開を許可する**ことを意味する（このループの目的そのものだが、意図して判断すること）
- allowlist に載っていないコマンドが発行された場合は実行中にプロンプトになる。ループは停止せず承認待ちになり、`/workflows` から応答できる
- 残るプロンプトの主因は `implement` / `debug` エージェントの自由なコマンド実行。数回実行した後に `/fewer-permission-prompts` で実測ベースの allowlist を育てるか、サンドボックス（`sandbox.enabled` + `autoAllowBashIfSandboxed`）で安全なコマンドを自動承認にすると収束が早い
- Workflow の初回起動時には承認プロンプトが出る。「don't ask again」を選ぶと以後はスキップされる

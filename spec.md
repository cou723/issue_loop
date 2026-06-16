# issue-loop

Claude Code をはじめとするコーディングエージェントで動くプラグイン。Issue（ここでは GitHub の Issue に限らず、プロジェクトの Todo リストとして捉える）ベースに開発を進め、自動的にループして次の Issue に取り組み続ける。

## コンポーネント一覧

### Skills（Claudeへの命令スキル）

- **`/issueloop`**：ループのオーケストレーター。セットアップ・ループ制御・各サブエージェントの呼び出しをすべて担う
- **`/push-and-pr`**：コミット・プッシュ・PR作成を一括実行する（`commit-commands:commit-push-pr` を流用）
- **`/cancel`**：実行中のループを中断する

### Agents（コンテキストを分離して実行するサブエージェント）

- **`iteration`**：1イテレーション（PR同期→Issue選定→実装→レビュー→PR作成）全体を担うオーケストレーター。各サブエージェントをネストして呼び出し、終了時に `iteration-signal` へ結果を書き出す
- **`pr-sync`**：前回チェック時点との差分を取得し、マージ済みPRと新規コメントが付いたPRを検出する。新規コメント付きPRからは Issue を自動作成し、重複防止のためPRにコメントで記録する。結果を `pr-context.md` に書き出す
- **`pick-issue`**：GitHub から最優先で取り組むべき Issue を1つ選ぶ。依存関係・既存PRの有無・`pr-context.md` のマージ情報で候補を絞り込み、ユーザー指定基準＞提供価値の高さ（バグ修正＞機能欠落の補完＞UX/品質改善＞cosmetic）＞マイルストーン/番号順で選定する
- **`info-gathering`**：Issue の不足情報を確認する。`AskUserQuestion` はサブエージェントから使えないため自分では質問せず、不足があれば質問内容を `questions.md` に書き出してメインセッションへ委ねる（エスカレーション方式）。再開時は `answers.md` の回答を `current-issue.md` と Issue に取り込んで進める
- **`pattern`**：Issue のタイプを `Feature` / `Debug` / `Refactor` / `Test` に分類し、結果をファイルに書き出す
- **`implement`**：実装を行う。`feature-dev:code-explorer` で調査し、実装後に `pr-review-toolkit:code-simplifier` でコードを整理する。最後にスコープ外の発見事項を書き出す
- **`debug`**：デバッグを行う。`feature-dev:code-explorer` で根本原因を特定し、修正を実装する。最後にスコープ外の発見事項を書き出す
- **`review`**：7つの専門エージェントを並列実行して変更内容をレビューする。各エージェントの指摘を「スコープ内」と「スコープ外」に分類し、`review-result.md` に書き出す
- **`issue-update`**：`implement` や `debug` が書き出したスコープ外の発見事項を統合・整理したうえで既存 Issue と照合し、重複のない新規 Issue を登録する

## ループのフロー（1イテレーション）

```mermaid
flowchart TD
    A[pr-sync] --> B[pickIssue]
    B --> C{Issue あり?}
    C -- なし --> Z[ループ終了]
    C -- あり --> D[infoGathering]
    D --> N{情報不足?}
    N -- "あり" --> Q["NEEDS_INPUT で停止<br/>メインが AskUserQuestion<br/>→ 回答を書き戻して再開"]
    Q --> D
    N -- "なし" --> E[pattern]
    E --> F["git checkout main → git checkout -b &lt;branch&gt;"]
    F --> G{next-action}
    G -- implement --> H[implement]
    G -- debug --> I[debug]
    H --> J[review]
    I --> J
    J --> K{スコープ内指摘あり?}
    K -- "Yes / 上限未満" --> G
    K -- "No / 上限到達" --> L[issue-update]
    L --> M[push-and-pr]
```

外側のループは `/issueloop` スキル自身が制御する。

## ループ機構

`/issueloop` スキルがオーケストレーターとして動作し、ループをスキル内のロジックで完結させる。外部 hook には依存しない。

ループ終了条件：
- 取り組む Issue が0件（`NO_ISSUE` シグナル）
- `max_iterations` 超過
- ユーザーが `/cancel` を実行（`.issue-loop/cancel-requested` フラグを検出 → `CANCELLED` シグナル）
- イテレーションが続行不能な失敗で終了（`FAILED` シグナル、またはシグナル未書き込みの異常終了）

各イテレーションは終了時に `.issue-loop/iteration-signal` へ `DONE` / `NO_ISSUE` / `CANCELLED` / `NEEDS_INPUT` / `FAILED` のいずれかを書き出す。オーケストレーターはイテレーション起動前に同ファイルを削除し、起動後に内容を読む。シグナルが空（サブエージェントのクラッシュ等）の場合も異常終了とみなしてループを停止する。

### NEEDS_INPUT（ユーザーへの質問）

`AskUserQuestion` はサブエージェントからは使えず、メインセッションの UI でのみ動作する。そのため info-gathering で情報不足を検出した場合、iteration は `questions.md` に質問を書き出し `NEEDS_INPUT` シグナルで停止する（ブランチ作成より前で止めるため Issue 選定状態は保たれる）。オーケストレーターは `questions.md` を読んで `AskUserQuestion` で質問し、回答を `answers.md` に書き戻したうえで iteration を `RESUME=true` で再起動する。再起動時は PR同期・Issue選定をスキップし、info-gathering が回答を取り込んで先へ進む。この再開はイテレーション数にカウントしない。

エラー発生時の挙動：必須ファイルの欠落・PR 作成失敗など続行不能な異常は、リトライやデバッグを繰り返さず `FAILED` を書いてループを停止する。同一 Issue を次イテレーションで無限に選び直す事故を防ぐため、PR が実在することを検証してから `DONE` とする。キャンセル要求は各ステップの区切りで検出し、現在のステップ完了後に停止する。

### 出力契約の保証（Stop フック）

「必ず特定のファイルを書き出して終了する」契約を持つエージェントは、フロントマターの `Stop` フックで自分の出力ファイルの存在を終了時に検証する。ファイルが未作成なら `decision: block` でエージェントに書き出しを促してから終了させる。LLM がステップを完了しながら最終的な書き出しだけを忘れて終了する事故を防ぐ安全網であり、ループ駆動を hook に依存させるものではない。

このフックが確実に機能するのは、対象ファイルが「呼び出し直前に削除され、呼ばれたら必ず書かれる」エージェントに限る（前イテレーションの残骸を存在チェックで誤判定しないため、オーケストレーターは各サブエージェント起動の直前に対象ファイルを削除する）。対象は iteration（`iteration-signal`）・pr-sync（`pr-context.md`）・pick-issue（`current-issue.md`）・pattern（`next-action.md`）・review（`review-result.md`）。条件付き出力や成果物がコード編集のみのエージェント（info-gathering・implement・debug・issue-update）はフック検証の対象外とする。

無限ブロックを避けるため、各フックは `stop_hook_active` が真の場合（一度ブロックして再開された後）は再ブロックせずそのまま終了させる。

## エージェント間インターフェース

各エージェントはファイルを介してデータを受け渡すことでコンテキストを節約する。ファイルはすべて `.issue-loop/` 以下に置く。

| ファイル | 書き込み | 読み込み | 用途 |
|---|---|---|---|
| `pr-snapshot.json` | /pr-sync | /pr-sync | 前回チェック時刻（`checked_at`）を保持するJSON |
| `pr-context.md` | /pr-sync | /pickIssue | 前回チェックからの差分（マージ済みPR一覧・新規コメント起因のIssue一覧） |
| `current-issue.md` | /pickIssue, /infoGathering, /pattern | /pattern, /implement, /debug | Issue の詳細・収集情報・タイプ |
| `issue-selection-comment.md` | /issueloop | /pickIssue | ユーザーが指定した Issue 選定基準。存在しない場合は既定基準で選定 |
| `questions.md` | /infoGathering | /issueloop | 情報不足時にユーザーへ尋ねる質問（`AskUserQuestion` 形式）。存在＝要ユーザー入力 |
| `answers.md` | /issueloop | /infoGathering | ユーザーの回答。再開時に info-gathering が取り込む |
| `next-action.md` | /pattern, /review | /issueloop | `implement` または `debug` の判定結果 |
| `review-result.md` | /review | /implement, /debug, /issueloop | レビュー結果・指摘内容・推奨アクション・合否 |
| `out-of-scope.md` | /implement, /debug, /review | /issue-update | スコープ外の発見事項リスト |
| `iteration-signal` | /iteration | /issueloop | イテレーション結果（`DONE`/`NO_ISSUE`/`CANCELLED`/`NEEDS_INPUT`/`FAILED`）。起動前にオーケストレーターが削除する |
| `cancel-requested` | /cancel | /issueloop, /iteration | キャンセル要求フラグ（存在＝要求あり） |

`current-issue.md` の構造：
```markdown
---
number: 123
title: "Issue title"
type: Feature | Debug | Refactor | Test
---
Issueの本文・追加収集情報
```

`review-result.md` の構造：
```markdown
---
status: pass | fail
next-action: implement | debug
---
## スコープ内の指摘（implement / debug に渡して今回修正する）
| 重大度 | 場所 | 指摘 |
|---|---|---|

## スコープ外の指摘（Issue 登録対象）
- ...
```

出力量は結果に応じて調整する（認知負荷の削減）。`pass` の場合はスコープ内の表を省いて「なし」とだけ記し全体を短い要約に留め、`fail` の場合のみスコープ内の指摘を重大度の高い順に表で記載する。

スコープ外の指摘は `out-of-scope.md` にも追記し、`/issue-update` が既存 Issue と照合して登録する。

## /pr-sync の詳細設計

### 目的

前回チェック時点との差分を検出し、以下の2つの情報を後続ステップに渡す。

- **マージ済みPR**: `pickIssue` が依存関係を解消済みと判断するために使う
- **新規コメント付きPR**: フィードバックを Issue 化して次のイテレーションで対応できるようにする

### pr-snapshot.json の構造

```json
{
  "checked_at": "<ISO8601>"
}
```

差分検出はすべて `scripts/pr-sync-gather.sh` がシェルスクリプトで行う。

### 差分検出ロジック（スクリプト内）

- **マージ済みPR**: `gh pr list --state merged` の `mergedAt` を `checked_at` と `jq` で比較
- **新規コメント付きPR**: `gh pr list --state open --json comments` の `createdAt` を `checked_at` と比較し、`[issue-loop]` 始まりのコメントは除外

差分収集後、`checked_at` を現在時刻で更新してスナップショットを上書きする。

### AIが判断する部分

`prs_with_new_comments` に挙がったPRのコメントを `gh pr view --comments` で取得し、修正・改善・バグを示唆するものかを判断してIssueを作成する。

### Issue 自動作成と重複防止

新規コメントが「修正・改善を示唆している」と判断した場合に Issue を作成する。

重複を防ぐため、Issue 作成後に対象PRへ以下の形式でコメントを投稿する:

```
[issue-loop] Issue #<number> を作成しました: <title>
```

スキャン時に既存PRコメントにこの形式が含まれていれば、そのコメントからは Issue を作成しない。

### pr-context.md の構造

```markdown
## マージされたPR
- #42: "Fix auth bug"
- #38: "Add user profile page"

## 新規コメントから作成したIssue
- Issue #55（PR #40 のコメントより）: "エラーメッセージが不親切"
```

## /review の詳細設計

複数の専門エージェントを並列実行し、それぞれの結果を集約する。

### レビューエージェント一覧

| エージェント | 観点 | 流用元 |
|---|---|---|
| comment-reviewer | コメントの妥当性。ファイル冒頭以外では「Why」のみを書く方針に沿っているか | `pr-review-toolkit:comment-analyzer` |
| design-reviewer | 既存設計との整合性・設計の妥当性（将来の肥大化リスク・過剰抽象化がないか） | 独自実装 |
| type-safety-reviewer | TypeScript の `as` 使用箇所の妥当性、lint/型チェッカー抑制コメントの理由が正当か | 独自実装 |
| security-reviewer | セキュリティ上の問題がないか（OWASP Top 10 相当） | 独自実装 |
| test-reviewer | 既存テストへの影響、新しいロジックに対応するテストが存在するか | `pr-review-toolkit:pr-test-analyzer` |
| error-handling-reviewer | 例外の握りつぶし・silent failures がないか | `pr-review-toolkit:silent-failure-hunter` |
| performance-reviewer | 明らかな非効率（N+1 クエリ・不要なループなど）がないか | 独自実装 |

### スコープ内 / スコープ外の分類基準

- **スコープ内**：今回の Issue の変更範囲内で発生している問題。`implement` または `debug` で即座に修正する
- **スコープ外**：今回の変更に関係するが Issue のスコープ外の問題、または変更前から存在していた既存コードの問題。Issue として登録して後回しにする

### pass / fail の判定

いずれかのエージェントがスコープ内の指摘を報告した場合は `fail`。スコープ内の指摘が0件であれば `pass`。

## 権限設計

各コンポーネントの `allowed-tools` フロントマター案。

| コンポーネント | 主要な allowed-tools |
|---|---|
| `/issueloop` | `Bash(bash *setup-issue-loop.sh)`, `Bash(test -f .issue-loop/cancel-requested)`, `Bash(test -f .issue-loop/ci.sh)`, `Bash(chmod +x .issue-loop/ci.sh)`, `Bash(rm -f .issue-loop/iteration-signal)`, `Bash(rm -f .issue-loop/questions.md)`, `Bash(rm -f .issue-loop/answers.md)`, `Bash(rm -f .issue-loop/issue-selection-comment.md)`, `Bash(grep * .issue-loop/iteration-signal)`, `Agent`, `AskUserQuestion`, `Read`, `Write` |
| `/pr-sync` | `Bash(gh pr list *)`, `Bash(gh pr view *)`, `Bash(gh issue create *)`, `Bash(gh pr comment *)`, `Read`, `Write` |
| `/pickIssue` | `Bash(gh issue list *)`, `Bash(gh issue view *)`, `Bash(gh pr list *)`, `Read`, `Write` |
| `/infoGathering` | `Bash(gh issue comment *)`, `Bash(gh issue view *)`, `Read`, `Write` |
| `/pattern` | `Read`, `Write` |
| `/review` | `Bash(git diff *)`, `Read`, `Glob`, `Grep`, `Agent`, `Write` |
| `/debug` | `Bash`, `Read`, `Grep`, `Glob`, `Agent`, `Write` |
| `/issue-update` | `Bash(gh issue create *)`, `Bash(gh issue list *)`, `Bash(gh issue view *)`, `Read`, `Write` |

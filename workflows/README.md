# workflows/（試作）

dynamic workflow ランタイム（Claude Code v2.1.154+、research preview）上で issue-loop の1イテレーションを実行する試作。エントリポイントは `/issue-loop:issueloop-wf`（`commands/issueloop-wf.md`）で、そこから `iteration.js` を Workflow ツールの `scriptPath` で起動する。

## 設計方針

オーケストレーション（ループ・分岐・状態）をモデルからスクリプトへ移し、モデルの実行漏れを補うための装置を不要にする。個々の作業エージェントの指示は既存の `agents/**/*.md` を参照して流用する（単一情報源の維持）。

| 従来の仕組み | 試作での置き換え |
|---|---|
| `agents/iteration.md`（中間オーケストレーター） | `iteration.js` のスクリプト本体 |
| `.issue-loop/iteration-signal` + Stop フック + バグ #17688 回復処理 | workflow の構造化リターン（`signal` フィールド） |
| `.issue-loop/next-action.md` / `review-result.md` / `out-of-scope.md` / `questions.md` / `answers.md` | スクリプト変数と `agent()` の `schema` による構造化リターン |
| `RESUME` フラグとステップスキップ規約 | `resumeFromRunId`（完了済み `agent()` はキャッシュが返る） |
| `agents/review/review.md` によるレビュワーのファンアウト・集約 | スクリプト側の `pipeline()` と集約ロジック |
| `CANCELLED` シグナル（実行中の中断） | `/workflows` ビューの停止操作 |

`.issue-loop/current-issue.md` と `.issue-loop/changes.diff` は従来どおりファイルのまま（大きなコンテンツはエージェント間でファイル渡しの方が適切なため）。

## 未確認の前提（要検証）

ドキュメントに明記されていない API 挙動に依存している箇所。動かない場合はここから疑う:

- プラグインのコマンドから Workflow ツールを `allowed-tools` で許可し、`scriptPath` に `${CLAUDE_PLUGIN_ROOT}` 配下を指定できるか（workflow の正式な配置場所は `.claude/workflows/` と `~/.claude/workflows/` のみで、プラグインコンポーネントとしては未サポート）
- `agent()` の `model` オプションの正確な構文（「スクリプトはステージを別モデルにルーティングできる」とだけ記載）
- `pipeline()` が並列実行か（ドキュメントの例はファンアウト用途だが並列性は明記なし）
- workflow 内エージェントで Skill ツール・MCP ツール（Playwright 等）が使えるか（`push-and-pr.md` の流用に影響。スクリプト側に gh 直接実行のフォールバック指示あり）
- `resumeFromRunId` は同一セッション内のみ有効

## 静的チェック

ランタイムは実行時に構文チェックのみ行い、`agent` / `pipeline` 等のグローバル未定義や
タイポは実行するまで検出できない。`check.mjs` は `tsc --checkJs` でその隙間を埋める
（初回のみ `cd workflows && npm install` が必要）。

```bash
node workflows/check.mjs workflows/iteration.js
```

検出できるのはグローバル未定義・構文エラーなど機械的なものに限られる。`agent()` の
戻り値の型は `any` のままなので、schema と実際に参照するプロパティ名の不整合（例:
`picked.number` のタイポ）までは検出しない。

## 試し方

1. `ln -s "$(pwd)" ~/.claude/skills/issue-loop` などでこのブランチのプラグインをローカル環境に反映する（[CLAUDE.md](../CLAUDE.md) 参照）
2. Issue のあるテスト用リポジトリで `/issue-loop:issueloop-wf -mi 1` を実行する
3. `/workflows` で進行を確認し、従来版（`/issue-loop:issueloop`）と信頼性・トークン消費を比較する

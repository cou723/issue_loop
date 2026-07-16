# workflows/

dynamic workflow ランタイム（Claude Code v2.1.154+、research preview）上で issue-loop の1イテレーションを実行する。エントリポイントは `/issue-loop:issueloop`（`commands/issueloop.md`）で、そこから `iteration.js` を Workflow ツールの `scriptPath` で起動する。

## 設計方針

オーケストレーション（ループ・分岐・状態）をモデルからスクリプトへ移し、モデルの実行漏れを補うための装置（シグナルファイル・Stop フック・回復処理）を不要にする。個々の作業エージェントの指示は既存の `agents/**/*.md` を参照して流用する（単一情報源の維持）。

- イテレーションの結果はファイルではなく workflow の構造化リターン（`signal` フィールド）で返す
- 制御フローに関わるエージェント出力は `agent()` の `schema` による構造化リターンで受け取る
- `NEEDS_INPUT` 後の再開は `resumeFromRunId`（完了済み `agent()` はキャッシュが返る）で行う
- レビュワーのファンアウト・集約はスクリプト側の `pipeline()` と集約ロジックで行う
- 実行中の中断は `/workflows` ビューの停止操作に委ねる

`.issue-loop/current-issue.md` と `.issue-loop/changes.diff` はファイルのまま（大きなコンテンツはエージェント間でファイル渡しの方が適切なため）。

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

## ローカルテスト

1. `ln -s "$(pwd)" ~/.claude/skills/issue-loop` などでこのブランチのプラグインをローカル環境に反映する（[CLAUDE.md](../CLAUDE.md) 参照）
2. Issue のあるテスト用リポジトリで `/issue-loop:issueloop -mi 1` を実行する
3. `/workflows` で進行を確認する

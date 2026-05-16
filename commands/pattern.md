---
description: "Issue のタイプを Feature / Debug / Refactor / Test に分類し、next-action.md に書き出す"
allowed-tools: ["Read(.issue-loop/current-issue.md)", "Write(.issue-loop/current-issue.md)", "Write(.issue-loop/next-action.md)"]
---

# Pattern

`.issue-loop/current-issue.md` を読み、Issue のタイプを分類せよ。

## 分類基準

- **Feature**: 新機能の追加・既存機能の拡張
- **Debug**: バグ修正・エラー対応・不具合修正
- **Refactor**: コード品質改善（外部から見た動作変更なし）
- **Test**: テストの追加・修正・テスト環境の整備

## 出力

1. `.issue-loop/current-issue.md` のフロントマターの `type:` を分類結果に更新する
2. `.issue-loop/next-action.md` に以下を書き出す:
   - `Debug` タイプ → `debug`
   - それ以外（Feature / Refactor / Test） → `implement`

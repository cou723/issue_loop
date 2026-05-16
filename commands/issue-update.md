---
description: "out-of-scope.md の発見事項と既存 Issue を照合し、重複のない新規 Issue を登録する"
allowed-tools: ["Bash(gh issue create *)", "Bash(gh issue list *)", "Bash(gh issue view *)", "Read"]
---

# Issue Update

`.issue-loop/out-of-scope.md` を読み、スコープ外として記録された問題を GitHub Issue として登録せよ。

## 手順

1. `.issue-loop/out-of-scope.md` が存在しない、または空の場合は終了
2. `gh issue list --state open --limit 100 --json number,title,body` で既存Issue一覧を取得
3. out-of-scope.md の各項目を統合する
   - 根本原因や対処方針が同一とみなせる項目はひとつにまとめる
   - 統合の判断基準：対象コンポーネントだけが異なり問題の種類が同じ場合は統合する。ビジネスロジックやファイルが全く異なる問題は統合しない
   - 統合後のタイトルは個別コンポーネント名を除いた横断的な表現にする（例：「全サービスでログ出力が不足している」）
   - 統合後のIssue本文には、まとめる前の各項目を箇条書きで列挙する
4. 統合後の各項目について、既存Issueと内容が重複していないか確認する
   - タイトルや本文が類似している場合は重複とみなして登録をスキップ
5. 重複しない項目を `gh issue create --title "<タイトル>" --body "<詳細な内容>"` で登録する

## 注意

- 既に登録済みの問題を重複登録しないよう注意する
- Issue タイトルは簡潔で検索しやすい形式にする
- Issue 本文には発見した経緯（どのIssue対応中に見つかったか）を記載する
- 統合によって情報が失われないよう、まとめた元の項目は本文に残す

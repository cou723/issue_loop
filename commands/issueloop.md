---
description: "Issue-loop を開始する。GitHub の Issue を自動的に選び、実装・レビュー・PR 作成までループする"
argument-hint: "[--max-iterations N] [--max-review-iterations N]"
allowed-tools: ["Bash(bash ${CLAUDE_PLUGIN_ROOT}/scripts/setup-issue-loop.sh:*)"]
---

# Issue Loop

セットアップスクリプトを実行する:

```!
bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup-issue-loop.sh" $ARGUMENTS
```

スクリプトの出力に従って、`.claude/issue-loop/iteration-prompt.md` を読み、指示に従って1イテレーションを実行せよ。

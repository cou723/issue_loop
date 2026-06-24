#!/usr/bin/env bash
set -euo pipefail

mkdir -p .issue-loop

if [[ -f .gitignore ]]; then
  if ! grep -qF '.issue-loop' .gitignore; then
    echo '.issue-loop*' >> .gitignore
  fi
else
  echo '.issue-loop*' > .gitignore
fi

# 前回実行の残骸を除去（クラッシュ時の誤読・誤った指摘の引き継ぎを防ぐ）
rm -f .issue-loop/cancel-requested
rm -f .issue-loop/iteration-signal
rm -f .issue-loop/review-result.md
rm -f .issue-loop/out-of-scope.md
rm -f .issue-loop/changes.diff

# 開始時刻を UTC で記録（result-dashboard での集計に使用）
date -u -Iseconds > .issue-loop/start-time

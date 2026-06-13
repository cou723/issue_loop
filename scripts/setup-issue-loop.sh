#!/bin/bash
set -euo pipefail

mkdir -p .issue-loop

if [[ -f .gitignore ]]; then
  if ! grep -qF '.issue-loop' .gitignore; then
    echo '.issue-loop*' >> .gitignore
  fi
else
  echo '.issue-loop*' > .gitignore
fi

rm -f .issue-loop/cancel-requested

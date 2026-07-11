#!/usr/bin/env python3
"""セッションのサブエージェント transcript 群を起動時刻順に一括要約する。

usage: summarize-subagents.py <subagents-dir>

<subagents-dir> は通常
~/.claude/projects/<ENCODED>/<sessionId>/subagents/ (agent-*.jsonl が並ぶ)。

各エージェントについて: 起動時刻 / ファイル名 / 行数 / エラー数 /
IN(最初のプロンプト先頭) / OUT(最後の assistant テキスト先頭) を表示する。
"""
import glob
import json
import os
import signal
import sys

signal.signal(signal.SIGPIPE, signal.SIG_DFL)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    rows = []
    for path in glob.glob(os.path.join(sys.argv[1], "*.jsonl")):
        first_ts = last_text = first_in = None
        errors = 0
        n = 0
        for line in open(path):
            n += 1
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = r.get("timestamp")
            if ts and not first_ts:
                first_ts = ts
            if r.get("isApiErrorMessage") or r.get("apiErrorStatus"):
                errors += 1
            if first_in is None:
                if r.get("type") == "queue-operation" and r.get("operation") == "enqueue":
                    first_in = str(r.get("content", ""))
                elif r.get("type") == "user":
                    c = r.get("message", {}).get("content")
                    if isinstance(c, list):
                        c = " ".join(
                            x.get("text", "") for x in c if isinstance(x, dict)
                        )
                    first_in = str(c)
            if r.get("type") == "assistant":
                for c in r.get("message", {}).get("content", []):
                    if isinstance(c, dict) and c.get("type") == "text":
                        last_text = c["text"]
            for c in (
                r.get("message", {}).get("content", [])
                if r.get("type") == "user"
                else []
            ):
                if isinstance(c, dict) and c.get("is_error"):
                    errors += 1
        rows.append((first_ts or "?", os.path.basename(path), n, errors,
                     first_in or "", last_text or ""))
    rows.sort()
    for ts, name, n, errors, first_in, last_text in rows:
        flag = f" errors={errors}" if errors else ""
        print(f"{ts[11:19]:8} {name} ({n}L{flag})")
        print(f"  IN : {first_in[:150]}".replace("\n", " "))
        print(f"  OUT: {last_text[:150]}".replace("\n", " "))


if __name__ == "__main__":
    main()

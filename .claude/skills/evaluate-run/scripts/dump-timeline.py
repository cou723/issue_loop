#!/usr/bin/env python3
"""Claude Code transcript (.jsonl) を1行1イベントのタイムラインに変換する。

usage: dump-timeline.py <session.jsonl> [--width N]

出力: 行番号 / 時刻(HH:MM:SS) / 種別 / 内容の先頭。
種別: A-text(assistantの発話) / TOOL(ツール呼び出し) / RES(結果, エラーはERR付き)
     / USER(ユーザー入力) / [その他レコード型]
"""
import json
import signal
import sys

signal.signal(signal.SIGPIPE, signal.SIG_DFL)


def flatten(content):
    if isinstance(content, list):
        return " ".join(
            x.get("text", "") for x in content if isinstance(x, dict)
        )
    return str(content)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    width = 160
    if "--width" in sys.argv:
        width = int(sys.argv[sys.argv.index("--width") + 1])
    if not args:
        print(__doc__)
        sys.exit(1)

    for i, line in enumerate(open(args[0])):
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        t = r.get("type")
        ts = (r.get("timestamp") or "")[11:19]
        if r.get("isApiErrorMessage") or r.get("apiErrorStatus"):
            print(f"{i:5d} {ts:8} !!! API ERROR: {str(r)[:width]}")
            continue
        if t == "assistant":
            for c in r.get("message", {}).get("content", []):
                if not isinstance(c, dict):
                    continue
                if c.get("type") == "text" and c["text"].strip():
                    txt = c["text"][:width].replace("\n", " ")
                    print(f"{i:5d} {ts:8} A-text: {txt}")
                elif c.get("type") == "tool_use":
                    inp = json.dumps(c.get("input", {}), ensure_ascii=False)
                    print(f"{i:5d} {ts:8} TOOL {c['name']}: {inp[:width]}")
        elif t == "user":
            c = r.get("message", {}).get("content")
            if isinstance(c, str):
                print(f"{i:5d} {ts:8} USER: {c[:width]!r}")
            elif isinstance(c, list):
                for x in c:
                    if not isinstance(x, dict):
                        continue
                    if x.get("type") == "tool_result":
                        s = flatten(x.get("content"))[:width].replace("\n", " ")
                        err = " ERR" if x.get("is_error") else ""
                        print(f"{i:5d} {ts:8} RES{err}: {s}")
                    elif x.get("type") == "text":
                        txt = x["text"][:width].replace("\n", " ")
                        print(f"{i:5d} {ts:8} USER: {txt!r}")
        else:
            op = r.get("operation") or r.get("subtype") or ""
            print(f"{i:5d} {ts:8} [{t}{' ' + op if op else ''}]")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""セッションのトークン使用量をエージェント別・モデル別に集計する。

usage: tokens-by-agent.py <session.jsonl>

対象: メイン transcript、<sessionId>/subagents/ 配下の全エージェント
(workflow エージェント含む)。workflow 実行の workflows/wf_*.json があれば
workflowProgress からエージェントのラベルを名寄せに使う。

出力: (1) エージェント個別の起動時刻順テーブル
      (2) 役割 (ラベルの "(round N)" を除いた部分 / agentType) 別の集計
コスト目安列は input を 1 とした価格比の重み付け合計
(output x5, cacheCreation x1.25, cacheRead x0.1)。
"""
import glob
import json
import os
import re
import signal
import sys
from collections import defaultdict

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

WEIGHTS = {"in": 1.0, "out": 5.0, "cw": 1.25, "cr": 0.1}


def usage_of(path):
    """transcript 1ファイルの (model別usage, 最初のtimestamp, API呼び出し数)"""
    per_model = defaultdict(lambda: {"in": 0, "out": 0, "cw": 0, "cr": 0, "calls": 0})
    first_ts = None
    for line in open(path):
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        if first_ts is None:
            first_ts = r.get("timestamp")
        if r.get("type") != "assistant":
            continue
        m = r.get("message", {})
        u = m.get("usage")
        if not u:
            continue
        s = per_model[m.get("model", "?")]
        s["in"] += u.get("input_tokens", 0)
        s["out"] += u.get("output_tokens", 0)
        s["cw"] += u.get("cache_creation_input_tokens", 0)
        s["cr"] += u.get("cache_read_input_tokens", 0)
        s["calls"] += 1
    return per_model, first_ts


def weighted(s):
    return sum(s[k] * WEIGHTS[k] for k in WEIGHTS)


def fmt(n):
    return f"{n:,}"


def main():
    if len(sys.argv) < 2 or not sys.argv[1].endswith(".jsonl"):
        print(__doc__)
        sys.exit(1)
    session_jsonl = sys.argv[1]
    session_dir = session_jsonl[: -len(".jsonl")]

    # workflow run JSON から agentId -> label
    labels = {}
    for wf in glob.glob(os.path.join(session_dir, "workflows", "wf_*.json")):
        try:
            run = json.load(open(wf))
        except (json.JSONDecodeError, OSError):
            continue
        for p in run.get("workflowProgress", []):
            if p.get("agentId"):
                labels[p["agentId"]] = p.get("label", "")

    # 収集対象: (表示名, 役割グループ, path)
    targets = [("(main)", "(main)", session_jsonl)]
    pattern = os.path.join(session_dir, "subagents", "**", "agent-*.jsonl")
    for path in glob.glob(pattern, recursive=True):
        agent_id = os.path.basename(path)[len("agent-"): -len(".jsonl")]
        agent_type = ""
        meta_path = path[: -len(".jsonl")] + ".meta.json"
        if os.path.exists(meta_path):
            try:
                agent_type = json.load(open(meta_path)).get("agentType", "")
            except (json.JSONDecodeError, OSError):
                pass
        label = labels.get(agent_id)
        name = label or agent_type or agent_id
        group = re.sub(r"\s*\(round \d+\)$", "", label) if label else (agent_type or "?")
        targets.append((name, group, path))

    rows = []
    groups = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    for name, group, path in targets:
        per_model, first_ts = usage_of(path)
        for model, s in per_model.items():
            rows.append((first_ts or "?", name, model, s))
            g = groups[group][model]
            for k in ("in", "out", "cw", "cr", "calls"):
                g[k] += s[k]
            g["agents"] += 1

    header = f"{'time':8} {'name':32} {'model':22} {'calls':>5} {'input':>8} {'output':>8} {'cacheW':>10} {'cacheR':>11} {'cost~':>10}"

    print("== agents (起動時刻順) ==")
    print(header)
    for ts, name, model, s in sorted(rows):
        print(f"{ts[11:19]:8} {name[:32]:32} {model:22} {s['calls']:>5} "
              f"{fmt(s['in']):>8} {fmt(s['out']):>8} {fmt(s['cw']):>10} "
              f"{fmt(s['cr']):>11} {fmt(round(weighted(s))):>10}")

    print()
    print("== by role x model (コスト目安順) ==")
    print(f"{'role':28} {'model':22} {'n':>3} {'calls':>5} {'input':>8} {'output':>8} {'cacheW':>10} {'cacheR':>11} {'cost~':>10}")
    flat = [(group, model, s) for group, ms in groups.items() for model, s in ms.items()]
    total = defaultdict(int)
    for group, model, s in sorted(flat, key=lambda x: -weighted(x[2])):
        print(f"{group[:28]:28} {model:22} {s['agents']:>3} {s['calls']:>5} "
              f"{fmt(s['in']):>8} {fmt(s['out']):>8} {fmt(s['cw']):>10} "
              f"{fmt(s['cr']):>11} {fmt(round(weighted(s))):>10}")
        for k in ("in", "out", "cw", "cr", "calls"):
            total[k] += s[k]
    print()
    print(f"TOTAL: calls={fmt(total['calls'])} input={fmt(total['in'])} "
          f"output={fmt(total['out'])} cacheW={fmt(total['cw'])} "
          f"cacheR={fmt(total['cr'])} cost~={fmt(round(weighted(total)))}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Print shared tester sessions from the Cloud Run logs as readable transcripts.

    deploy/sessions.py [--hours 4] [--session ID] [--project P] [--service S]
    deploy/sessions.py --stdin < events.json      # a `gcloud logging read --format json` dump, or raw JSON lines

Events are what the SPA posts to POST /api/session when "Share session with developer" is on
(web/src/telemetry/share.ts); the server logs each as one JSON line (deploy/server/session.go).
Standard library only.
"""

import argparse
import json
import subprocess
import sys
from collections import Counter, defaultdict

FILTER = 'resource.type="cloud_run_revision" AND resource.labels.service_name="{service}" AND jsonPayload.session_event=true'


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--hours", type=float, default=4, help="look back this many hours (default 4)")
    ap.add_argument("--session", help="only this session id")
    ap.add_argument("--project", default="ai-compute-planner")
    ap.add_argument("--service", default="capplanner")
    ap.add_argument("--stdin", action="store_true", help="read events from stdin instead of gcloud")
    args = ap.parse_args()

    raw = sys.stdin.read() if args.stdin else read_from_gcloud(args)
    events = [e for e in parse_events(raw) if not args.session or e["session_id"] == args.session]
    if not events:
        print("no session events found", file=sys.stderr)
        return 1
    sessions = defaultdict(list)
    for e in events:
        sessions[e["session_id"]].append(e)
    for sid, evs in sorted(sessions.items(), key=lambda kv: kv[1][0]["received_at"]):
        print_session(sid, sorted(evs, key=lambda e: (e["seq"], e["received_at"])))
    return 0


def read_from_gcloud(args) -> str:
    cmd = [
        "gcloud", "logging", "read", FILTER.format(service=args.service),
        "--project", args.project, "--freshness", f"{args.hours}h", "--format", "json", "--order", "asc",
    ]
    if args.session:
        cmd[3] += f' AND jsonPayload.session_id="{args.session}"'
    done = subprocess.run(cmd, capture_output=True, text=True)
    if done.returncode != 0:
        sys.exit(f"gcloud failed: {done.stderr.strip()}")
    return done.stdout


def parse_events(raw: str) -> list:
    """Accepts gcloud's JSON array of log entries or bare JSON lines as the server writes them."""
    text = raw.strip()
    if not text:
        return []
    rows = json.loads(text) if text.startswith("[") else [json.loads(line) for line in text.splitlines() if line.strip()]
    events = []
    for row in rows:
        payload = row.get("jsonPayload", row)
        if payload.get("session_event") is not True:
            continue
        events.append({
            "received_at": payload.get("received_at") or row.get("timestamp", ""),
            "session_id": payload.get("session_id", "?"),
            "plan_id": payload.get("plan_id", ""),
            "kind": payload.get("kind", "?"),
            "seq": int(payload.get("seq", 0)),
            "payload": payload.get("payload"),
        })
    return events


def print_session(sid: str, events: list) -> None:
    kinds = Counter(e["kind"] for e in events)
    plans = sorted({e["plan_id"] for e in events if e["plan_id"]})
    print(f"\n== session {sid}  plan {', '.join(plans) or '-'}  {clock(events[0])} → {clock(events[-1])}  "
          f"({len(events)} events: {', '.join(f'{n} {k}' for k, n in sorted(kinds.items()))})")
    for e in events:
        render = RENDERERS.get(e["kind"], render_unknown)
        for i, line in enumerate(render(e["payload"] or {})):
            print(f"{clock(e) if i == 0 else ' ' * 8}  {line}")


def clock(e: dict) -> str:
    t = e["received_at"]
    return t[11:19] if len(t) >= 19 else t


def render_commands(p: dict) -> list:
    return [f"cmd     {describe_command(entry)}" for entry in p.get("entries", [])]


def describe_command(entry: dict) -> str:
    c = entry.get("command", {})
    t = c.get("type", "?")
    text = {
        "loadPlan": lambda: f"loadPlan {c.get('plan', {}).get('meta', {}).get('planId', '?')}",
        "setField": lambda: f"setField {c.get('path')} = {json.dumps(c.get('value'))}",
        "applyPatch": lambda: "applyPatch " + ", ".join(f"{op.get('path')}={json.dumps(op.get('value'))}" for op in c.get("patch", [])),
        "proposeChange": lambda: f"proposeChange {c.get('id')}: {c.get('summary')}",
        "select": lambda: f"select {json.dumps(c.get('selection'))}",
        "setBaseline": lambda: f"setBaseline {c.get('label')!r}",
        "resultReceived": lambda: f"resultReceived {c.get('status')}",
        "errorRaised": lambda: f"errorRaised {c.get('error', {}).get('kind')}: {c.get('error', {}).get('message')}",
    }.get(t, lambda: t + " " + json.dumps({k: v for k, v in c.items() if k != "type"}))()
    rejected = entry.get("rejected")
    if rejected:
        text += f"   [rejected: {rejected.get('message')}]"
    return f"#{entry.get('seq', '?')} {text}"


def render_result(p: dict) -> list:
    s = p.get("summary") or {}
    diags = p.get("diagnostics") or []
    metrics = [
        ("lcoc", s.get("lcoc_per_gpu_hour"), "${}/GPU-h"),
        ("capex", s.get("total_capex"), "${}"),
        ("npv", s.get("npv"), "${}"),
        ("irr", s.get("unlevered_irr_pct"), "{}%"),
    ]
    shown = "  ".join(f"{k} {u.format(fmt(v))}" for k, v, u in metrics if v is not None)
    counts = Counter(d.get("severity", "?") for d in diags)
    lines = [f"result  {p.get('status', '?')}  {shown}  ({', '.join(f'{n} {k.lower()}' for k, n in sorted(counts.items())) or 'no diagnostics'})"]
    lines += [f"        {d.get('severity')} {d.get('code')} @ {d.get('proto_path', '')}: {d.get('message', '')}"
              for d in diags if d.get("severity") == "ERROR"]
    return lines


def render_turn(p: dict) -> list:
    lines = [f"user    > {oneline(p.get('user', ''))}"]
    for t in p.get("tools", []):
        lines.append(f"tool    {t.get('name')} {t.get('input', '')}{'  [error]' if t.get('isError') else ''}")
    usage = p.get("usage") or {}
    tokens = f"  (in {usage.get('input_tokens', '?')} · out {usage.get('output_tokens', '?')})" if usage else ""
    lines.append(f"copilot {oneline(p.get('assistant', ''))}{tokens}")
    if p.get("error"):
        lines.append(f"ERROR   copilot: {p['error']}")
    if p.get("notice"):
        lines.append(f"notice  {p['notice']}")
    return lines


def render_error(p: dict) -> list:
    return [f"ERROR   {p.get('source', '?')}/{p.get('kind', '?')}: {p.get('message', '')}"]


def render_unknown(p) -> list:
    return [f"?       {json.dumps(p)[:200]}"]


RENDERERS = {"commands": render_commands, "result": render_result, "copilot_turn": render_turn, "error": render_error}


def fmt(v) -> str:
    if isinstance(v, (int, float)):
        return f"{v:,.2f}" if abs(v) < 1000 else f"{v:,.0f}"
    return str(v)


def oneline(s: str, limit: int = 400) -> str:
    s = " ".join(str(s).split())
    return s if len(s) <= limit else s[:limit] + "…"


if __name__ == "__main__":
    sys.exit(main())

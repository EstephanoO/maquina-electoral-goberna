#!/usr/bin/env python3

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple
from urllib.error import URLError
from urllib.request import Request, urlopen


def now_ts() -> int:
    return int(time.time())


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text())
    except Exception:
        return default


def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n")


def fetch_json(url: str, timeout: int = 8) -> Dict[str, Any]:
    req = Request(url, headers={"Cache-Control": "no-cache"})
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def status_value(counters: Dict[str, Any], metric: str, code: str) -> int:
    return int(((counters or {}).get(metric, {}) or {}).get(code, 0) or 0)


def severity_rank(level: str) -> int:
    return {"ok": 0, "warn": 1, "crit": 2, "p1": 3}.get(level, 0)


def max_severity(a: str, b: str) -> str:
    return a if severity_rank(a) >= severity_rank(b) else b


def evaluate_latency(
    alerts: List[Dict[str, Any]],
    key: str,
    label: str,
    accepted: Dict[str, Any],
    accepted_delta: int,
    min_requests: int,
    warn_p95: int,
    warn_p99: int,
    crit_p95: int,
    crit_p99: int,
) -> None:
    if accepted_delta < min_requests:
        return
    p95 = int(accepted.get("p95_ms", 0) or 0)
    p99 = int(accepted.get("p99_ms", 0) or 0)
    if p95 > crit_p95 or p99 > crit_p99:
        alerts.append({"key": key, "severity": "crit", "message": f"{label} p95={p95} p99={p99}"})
    elif p95 > warn_p95 or p99 > warn_p99:
        alerts.append({"key": key, "severity": "warn", "message": f"{label} p95={p95} p99={p99}"})


def evaluate_queue(
    alerts: List[Dict[str, Any]],
    key: str,
    label: str,
    depth: int,
    flush_age: int,
    warn_depth: int,
    warn_flush_age: int,
    crit_depth: int,
    crit_flush_age: int,
) -> None:
    if depth > crit_depth or flush_age > crit_flush_age:
        alerts.append({"key": key, "severity": "crit", "message": f"{label} depth={depth} flush_age_ms={flush_age}"})
    elif depth > warn_depth or flush_age > warn_flush_age:
        alerts.append({"key": key, "severity": "warn", "message": f"{label} depth={depth} flush_age_ms={flush_age}"})


def send_webhook(url: str, payload: Dict[str, Any]) -> None:
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, method="POST", headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=6):
        pass


def main() -> int:
    parser = argparse.ArgumentParser(description="Check backend operational alerts without Grafana/Prometheus")
    parser.add_argument("--api-base", default="http://127.0.0.1", help="Backend base URL")
    parser.add_argument("--thresholds", default="scripts/ops/ops_alert_thresholds.json", help="Thresholds JSON path")
    parser.add_argument("--state-file", default="/var/lib/nexus/ops-alert-state.json", help="State file path")
    args = parser.parse_args()

    thresholds_path = Path(args.thresholds)
    state_path = Path(args.state_file)

    thresholds = load_json(thresholds_path, None)
    if not isinstance(thresholds, dict):
        print("ERROR: invalid thresholds file")
        return 3

    window_minutes = int(thresholds.get("window_minutes", 10))
    persist_seconds = int(thresholds.get("persist_seconds", 300))
    min_requests = int(thresholds.get("min_requests", 200))
    cutoff = now_ts() - window_minutes * 60

    state = load_json(state_path, {"history": [], "active": {}})
    if not isinstance(state, dict):
        state = {"history": [], "active": {}}

    try:
        metrics = fetch_json(f"{args.api_base}/api/metrics")
        agents_health = fetch_json(f"{args.api_base}/api/agents/health")
    except URLError as error:
        print(f"ERROR: fetch failed: {error}")
        return 3
    except Exception as error:
        print(f"ERROR: unexpected fetch error: {error}")
        return 3

    ts_now = now_ts()
    counters = metrics.get("counters", {}) or {}
    forms_202 = status_value(counters, "forms_ingest_total", "202")
    forms_429 = status_value(counters, "forms_ingest_total", "429")
    tracking_202 = status_value(counters, "tracking_ingest_total", "202")

    history = [row for row in state.get("history", []) if isinstance(row, dict)]
    history.append({"ts": ts_now, "forms_202": forms_202, "forms_429": forms_429, "tracking_202": tracking_202})
    history = [row for row in history if int(row.get("ts", 0)) >= cutoff]

    baseline = history[0] if history else {"forms_202": forms_202, "forms_429": forms_429, "tracking_202": tracking_202}
    forms_202_delta = max(0, forms_202 - int(baseline.get("forms_202", forms_202)))
    forms_429_delta = max(0, forms_429 - int(baseline.get("forms_429", forms_429)))
    tracking_202_delta = max(0, tracking_202 - int(baseline.get("tracking_202", tracking_202)))

    forms_total_delta = forms_202_delta + forms_429_delta
    forms_429_ratio = (forms_429_delta / forms_total_delta) if forms_total_delta > 0 else 0.0

    outcome_lat = metrics.get("ingest_outcome_latencies", {}) or {}
    forms_accepted = ((outcome_lat.get("forms", {}) or {}).get("accepted", {}) or {})
    tracking_accepted = ((outcome_lat.get("tracking", {}) or {}).get("accepted", {}) or {})

    gauges = metrics.get("gauges", {}) or {}
    forms_depth = int(gauges.get("forms_queue_depth", 0) or 0)
    forms_flush_age = int(gauges.get("forms_last_flush_age_ms", 0) or 0)
    tracking_depth = int(gauges.get("tracking_queue_depth", 0) or 0)
    tracking_flush_age = int(gauges.get("tracking_last_flush_age_ms", 0) or 0)

    alerts: List[Dict[str, Any]] = []

    evaluate_latency(
        alerts,
        "forms_latency",
        "forms accepted latency",
        forms_accepted,
        forms_202_delta,
        min_requests,
        int(thresholds["forms_accepted"]["warn"]["p95_ms"]),
        int(thresholds["forms_accepted"]["warn"]["p99_ms"]),
        int(thresholds["forms_accepted"]["crit"]["p95_ms"]),
        int(thresholds["forms_accepted"]["crit"]["p99_ms"]),
    )
    evaluate_latency(
        alerts,
        "tracking_latency",
        "tracking accepted latency",
        tracking_accepted,
        tracking_202_delta,
        min_requests,
        int(thresholds["tracking_accepted"]["warn"]["p95_ms"]),
        int(thresholds["tracking_accepted"]["warn"]["p99_ms"]),
        int(thresholds["tracking_accepted"]["crit"]["p95_ms"]),
        int(thresholds["tracking_accepted"]["crit"]["p99_ms"]),
    )

    if forms_total_delta >= min_requests:
        ratio_thresholds = thresholds["forms_rate_limited_ratio"]
        if forms_429_ratio > float(ratio_thresholds["p1"]):
            alerts.append({"key": "forms_rate_limit", "severity": "p1", "message": f"forms 429 ratio={forms_429_ratio:.4f}"})
        elif forms_429_ratio > float(ratio_thresholds["crit"]):
            alerts.append({"key": "forms_rate_limit", "severity": "crit", "message": f"forms 429 ratio={forms_429_ratio:.4f}"})
        elif forms_429_ratio > float(ratio_thresholds["warn"]):
            alerts.append({"key": "forms_rate_limit", "severity": "warn", "message": f"forms 429 ratio={forms_429_ratio:.4f}"})

    evaluate_queue(
        alerts,
        "forms_queue",
        "forms queue",
        forms_depth,
        forms_flush_age,
        int(thresholds["queue"]["forms"]["warn"]["depth"]),
        int(thresholds["queue"]["forms"]["warn"]["flush_age_ms"]),
        int(thresholds["queue"]["forms"]["crit"]["depth"]),
        int(thresholds["queue"]["forms"]["crit"]["flush_age_ms"]),
    )
    evaluate_queue(
        alerts,
        "tracking_queue",
        "tracking queue",
        tracking_depth,
        tracking_flush_age,
        int(thresholds["queue"]["tracking"]["warn"]["depth"]),
        int(thresholds["queue"]["tracking"]["warn"]["flush_age_ms"]),
        int(thresholds["queue"]["tracking"]["crit"]["depth"]),
        int(thresholds["queue"]["tracking"]["crit"]["flush_age_ms"]),
    )

    if not bool(agents_health.get("ok", False)):
        alerts.append({"key": "agents_health", "severity": "crit", "message": "agents health not ok"})

    active_state = state.get("active", {}) if isinstance(state.get("active"), dict) else {}
    next_active: Dict[str, Dict[str, Any]] = {}
    firing: List[Dict[str, Any]] = []
    for alert in alerts:
        key = str(alert["key"])
        prev = active_state.get(key, {}) if isinstance(active_state.get(key), dict) else {}
        since = int(prev.get("breach_since", ts_now))
        if not prev:
            since = ts_now
        next_active[key] = {"severity": alert["severity"], "breach_since": since, "message": alert["message"]}
        if ts_now - since >= persist_seconds:
            firing.append(alert)

    resolved = [key for key in active_state.keys() if key not in next_active]

    highest = "ok"
    for alert in firing:
        highest = max_severity(highest, str(alert["severity"]))

    result = {
        "ts": ts_now,
        "window_minutes": window_minutes,
        "forms_202_delta": forms_202_delta,
        "forms_429_delta": forms_429_delta,
        "tracking_202_delta": tracking_202_delta,
        "forms_429_ratio": forms_429_ratio,
        "highest_severity": highest,
        "firing": firing,
        "resolved": resolved,
    }

    state["history"] = history
    state["active"] = next_active
    save_json(state_path, state)

    webhook = (os.getenv("OPS_ALERT_WEBHOOK_URL") or "").strip()
    if webhook and (firing or resolved):
        try:
            send_webhook(webhook, result)
        except Exception as error:
            print(f"WARN: webhook failed: {error}")

    print(json.dumps(result, ensure_ascii=True))

    if highest in ("crit", "p1"):
        return 2
    if highest == "warn":
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

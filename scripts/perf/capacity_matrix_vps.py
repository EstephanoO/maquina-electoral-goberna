#!/usr/bin/env python3

import argparse
import json
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List, Tuple
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def read_token(env_path: str) -> str:
    text = Path(env_path).read_text()
    for line in text.splitlines():
        if line.startswith("AGENT_INGEST_TOKEN="):
            return line.split("=", 1)[1].strip().replace('"', "").replace("'", "")
    return ""


def quantile(sorted_values: List[float], p: int) -> float:
    if not sorted_values:
        return 0.0
    idx = max(0, min(len(sorted_values) - 1, int((p / 100) * (len(sorted_values) - 1))))
    return round(sorted_values[idx], 2)


def post_json(url: str, headers: Dict[str, str], payload: Dict) -> Tuple[int, float]:
    req = Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
    t0 = time.perf_counter()
    try:
        with urlopen(req, timeout=10) as response:
            status = response.status
    except HTTPError as error:
        status = error.code
    except Exception:
        status = 0
    latency_ms = (time.perf_counter() - t0) * 1000
    return status, latency_ms


def run_stream(
    name: str,
    base_url: str,
    endpoint: str,
    rps: float,
    duration_sec: int,
    workers: int,
    headers: Dict[str, str],
    payload_factory,
):
    statuses: Counter = Counter()
    latencies: List[float] = []
    submitted = 0
    start = time.perf_counter()
    stop_at = start + duration_sec
    next_tick = start

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = []
        seq = 0
        while True:
            now = time.perf_counter()
            if now >= stop_at:
                break
            if now < next_tick:
                time.sleep(min(0.002, next_tick - now))
                continue

            seq += 1
            payload = payload_factory(seq)
            futures.append(executor.submit(post_json, f"{base_url}{endpoint}", headers, payload))
            submitted += 1
            next_tick += 1.0 / max(rps, 0.1)

        for future in as_completed(futures):
            status, latency_ms = future.result()
            statuses[status] += 1
            latencies.append(latency_ms)

    latencies.sort()
    return {
        "name": name,
        "submitted": submitted,
        "statuses": dict(statuses),
        "p50_ms": quantile(latencies, 50),
        "p90_ms": quantile(latencies, 90),
        "p95_ms": quantile(latencies, 95),
        "p99_ms": quantile(latencies, 99),
        "max_ms": round(latencies[-1], 2) if latencies else 0.0,
    }


def fetch_json(url: str) -> Dict:
    with urlopen(Request(url), timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def run_scenario(base_url: str, token: str, scenario: str, tracking_rps: float, forms_rps: float, duration_sec: int) -> Dict:
    tracking_headers = {"Content-Type": "application/json", "x-agent-token": token}
    forms_headers = {"Content-Type": "application/json", "x-agent-id": f"bench-{scenario}"}
    scenario_key = int(time.time())

    tracking_result: Dict = {}
    forms_result: Dict = {}

    def run_tracking():
        nonlocal tracking_result

        def payload(seq: int) -> Dict:
            agent_num = (seq % max(1, int(tracking_rps * 5))) + 1
            return {
                "agent_id": f"cap-{scenario}-{agent_num:04d}",
                "ts": "2026-02-15T20:20:00Z",
                "lat": -12.0464,
                "lng": -77.0428,
                "accuracy": 7,
                "speed": 1.2,
                "heading": 90,
                "battery": 78,
                "seq": scenario_key * 100000 + seq,
            }

        tracking_result = run_stream(
            "tracking",
            base_url,
            "/api/agents/location",
            tracking_rps,
            duration_sec,
            workers=40,
            headers=tracking_headers,
            payload_factory=payload,
        )

    def run_forms():
        nonlocal forms_result

        def payload(seq: int) -> Dict:
            actor = f"enc-{scenario}-{(seq % 80) + 1:03d}"
            return {
                "nombre": "Load Test",
                "telefono": "999000000",
                "fecha": "2026-02-15T20:20:00Z",
                "x": 279854,
                "y": 8661420,
                "zona": "18S",
                "candidate": "Benchmark",
                "encuestador": actor,
                "encuestador_id": actor,
                "candidato_preferido": "Benchmark",
                "client_id": f"cap-{scenario}-{scenario_key}-form-{seq}",
            }

        forms_result = run_stream(
            "forms",
            base_url,
            "/api/forms",
            forms_rps,
            duration_sec,
            workers=20,
            headers=forms_headers,
            payload_factory=payload,
        )

    t1 = threading.Thread(target=run_tracking)
    t2 = threading.Thread(target=run_forms)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    agents_health = fetch_json(f"{base_url}/api/agents/health")
    metrics = fetch_json(f"{base_url}/api/metrics")

    return {
        "scenario": scenario,
        "tracking_rps": tracking_rps,
        "forms_rps": forms_rps,
        "duration_sec": duration_sec,
        "tracking": tracking_result,
        "forms": forms_result,
        "agents_health": {
            "online_agents": agents_health.get("online_agents"),
            "queue_depth": agents_health.get("queue_depth"),
            "last_flush_duration_ms": agents_health.get("last_flush_duration_ms"),
        },
        "gauges": {
            "tracking_queue_depth": (metrics.get("gauges") or {}).get("tracking_queue_depth"),
            "forms_queue_depth": (metrics.get("gauges") or {}).get("forms_queue_depth"),
            "tracking_last_flush_age_ms": (metrics.get("gauges") or {}).get("tracking_last_flush_age_ms"),
            "forms_last_flush_age_ms": (metrics.get("gauges") or {}).get("forms_last_flush_age_ms"),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run VPS capacity matrix for tracking/forms")
    parser.add_argument("--base-url", default="http://127.0.0.1")
    parser.add_argument("--env-path", default="/srv/app/.env")
    parser.add_argument("--duration", type=int, default=120)
    args = parser.parse_args()

    token = read_token(args.env_path)
    if not token:
        raise SystemExit("AGENT_INGEST_TOKEN missing")

    scenarios = [
        ("conservative", 6.0, 1.0),
        ("normal", 15.0, 3.0),
        ("high", 30.0, 6.0),
        ("aggressive", 50.0, 10.0),
    ]

    results = []
    for scenario, trps, frps in scenarios:
        results.append(run_scenario(args.base_url, token, scenario, trps, frps, args.duration))

    print(json.dumps(results, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()

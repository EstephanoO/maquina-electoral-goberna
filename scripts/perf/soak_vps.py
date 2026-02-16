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


def post_json(url: str, headers: Dict[str, str], payload: Dict) -> Tuple[int, float]:
    request = Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
    t0 = time.perf_counter()
    try:
        with urlopen(request, timeout=10) as response:
            status = response.status
    except HTTPError as error:
        status = error.code
    except Exception:
        status = 0
    return status, (time.perf_counter() - t0) * 1000


def fetch_json(url: str) -> Dict:
    with urlopen(Request(url), timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def quantile(values: List[float], p: int) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = max(0, min(len(ordered) - 1, int((p / 100) * (len(ordered) - 1))))
    return round(ordered[idx], 2)


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
    statuses = Counter()
    latencies = []
    submitted = 0
    start = time.perf_counter()
    stop = start + duration_sec
    tick = start

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = []
        seq = 0
        while True:
            now = time.perf_counter()
            if now >= stop:
                break
            if now < tick:
                time.sleep(min(0.002, tick - now))
                continue

            seq += 1
            payload = payload_factory(seq)
            futures.append(executor.submit(post_json, f"{base_url}{endpoint}", headers, payload))
            submitted += 1
            tick += 1.0 / max(rps, 0.1)

        for future in as_completed(futures):
            status, latency_ms = future.result()
            statuses[status] += 1
            latencies.append(latency_ms)

    return {
        "name": name,
        "submitted": submitted,
        "statuses": dict(statuses),
        "p50_ms": quantile(latencies, 50),
        "p90_ms": quantile(latencies, 90),
        "p95_ms": quantile(latencies, 95),
        "p99_ms": quantile(latencies, 99),
        "max_ms": round(max(latencies), 2) if latencies else 0.0,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run soak test for tracking/forms on VPS")
    parser.add_argument("--base-url", default="http://127.0.0.1")
    parser.add_argument("--env-path", default="/srv/app/.env")
    parser.add_argument("--duration", type=int, default=2700)
    parser.add_argument("--tracking-rps", type=float, default=15.0)
    parser.add_argument("--forms-rps", type=float, default=3.0)
    parser.add_argument("--monitor-interval", type=int, default=30)
    args = parser.parse_args()

    token = read_token(args.env_path)
    if not token:
        raise SystemExit("AGENT_INGEST_TOKEN missing")

    tracking_headers = {"Content-Type": "application/json", "x-agent-token": token}
    forms_headers = {"Content-Type": "application/json", "x-agent-id": "soak"}

    monitoring = []
    monitor_stop = False

    def monitor():
        while not monitor_stop:
            try:
                agents = fetch_json(f"{args.base_url}/api/agents/health")
                metrics = fetch_json(f"{args.base_url}/api/metrics")
                gauges = metrics.get("gauges") or {}
                monitoring.append(
                    {
                        "ts": time.time(),
                        "online_agents": agents.get("online_agents"),
                        "queue_depth_agents": agents.get("queue_depth"),
                        "tracking_queue_depth": gauges.get("tracking_queue_depth"),
                        "forms_queue_depth": gauges.get("forms_queue_depth"),
                        "tracking_last_flush_age_ms": gauges.get("tracking_last_flush_age_ms"),
                        "forms_last_flush_age_ms": gauges.get("forms_last_flush_age_ms"),
                    }
                )
            except Exception:
                monitoring.append({"ts": time.time(), "error": "monitor_fetch_failed"})
            for _ in range(args.monitor_interval):
                if monitor_stop:
                    break
                time.sleep(1)

    scenario_key = int(time.time())

    def tracking_payload(seq: int) -> Dict:
        pool = max(1, int(args.tracking_rps * 8))
        agent_num = (seq % pool) + 1
        return {
            "agent_id": "soak-agent-%04d" % agent_num,
            "ts": "2026-02-15T20:30:00Z",
            "lat": -12.0464,
            "lng": -77.0428,
            "accuracy": 6,
            "speed": 1.1,
            "heading": 120,
            "battery": 81,
            "seq": scenario_key * 100000 + seq,
        }

    def forms_payload(seq: int) -> Dict:
        actor = "soak-enc-%03d" % ((seq % 120) + 1)
        return {
            "nombre": "Soak Test",
            "telefono": "999000000",
            "fecha": "2026-02-15T20:30:00Z",
            "x": 279854,
            "y": 8661420,
            "zona": "18S",
            "candidate": "Benchmark",
            "encuestador": actor,
            "encuestador_id": actor,
            "candidato_preferido": "Benchmark",
            "client_id": "soak-%d-form-%d" % (scenario_key, seq),
        }

    monitor_thread = threading.Thread(target=monitor, daemon=True)
    monitor_thread.start()

    tracking_result = {}
    forms_result = {}

    def run_tracking():
        nonlocal tracking_result
        tracking_result = run_stream(
            "tracking",
            args.base_url,
            "/api/agents/location",
            args.tracking_rps,
            args.duration,
            workers=60,
            headers=tracking_headers,
            payload_factory=tracking_payload,
        )

    def run_forms():
        nonlocal forms_result
        forms_result = run_stream(
            "forms",
            args.base_url,
            "/api/forms",
            args.forms_rps,
            args.duration,
            workers=30,
            headers=forms_headers,
            payload_factory=forms_payload,
        )

    t0 = time.perf_counter()
    t_tracking = threading.Thread(target=run_tracking)
    t_forms = threading.Thread(target=run_forms)
    t_tracking.start()
    t_forms.start()
    t_tracking.join()
    t_forms.join()
    wall_ms = round((time.perf_counter() - t0) * 1000, 2)

    monitor_stop = True
    monitor_thread.join(timeout=3)

    agents_final = fetch_json(f"{args.base_url}/api/agents/health")
    metrics_final = fetch_json(f"{args.base_url}/api/metrics")

    result = {
        "duration_sec": args.duration,
        "tracking_rps": args.tracking_rps,
        "forms_rps": args.forms_rps,
        "wall_ms": wall_ms,
        "tracking": tracking_result,
        "forms": forms_result,
        "agents_health_final": agents_final,
        "metrics_final": metrics_final,
        "monitoring_samples": monitoring,
    }

    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()

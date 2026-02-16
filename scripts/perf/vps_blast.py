#!/usr/bin/env python3

import argparse
import json
import subprocess
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict


def read_backend_token() -> str:
    try:
        output = subprocess.check_output(
            ["docker", "inspect", "nexus_backend", "--format", "{{range .Config.Env}}{{println .}}{{end}}"],
            text=True,
        )
    except Exception:
        return ""

    for line in output.splitlines():
        if line.startswith("AGENT_INGEST_TOKEN="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def post_json(url: str, headers: Dict[str, str], payload: dict) -> str:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return str(response.status)
    except urllib.error.HTTPError as error:
        return str(error.code)
    except Exception:
        return "network_error"


def run_forms(total: int, workers: int, prefix: str) -> Counter:
    url = "http://127.0.0.1/api/forms"
    headers = {"Content-Type": "application/json"}

    def send(i: int) -> str:
        actor = f"enc-{(i % 200) + 1:03d}"
        payload = {
            "nombre": "Bench Form",
            "telefono": "999000000",
            "fecha": "2026-02-15T18:10:00Z",
            "x": 279854,
            "y": 8661420,
            "zona": "18S",
            "candidate": "Benchmark",
            "encuestador": actor,
            "encuestador_id": actor,
            "candidato_preferido": "Benchmark",
            "client_id": f"{prefix}-form-{i}",
        }
        return post_json(url, headers, payload)

    counts: Counter = Counter()
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(send, i) for i in range(1, total + 1)]
        for future in as_completed(futures):
            counts[future.result()] += 1
    return counts


def run_tracking(total: int, workers: int, prefix: str) -> Counter:
    url = "http://127.0.0.1/api/agents/location"
    token = read_backend_token()
    headers = {"Content-Type": "application/json", "x-agent-token": token}

    def send(i: int) -> str:
        payload = {
            "agent_id": f"{prefix}-agent-{(i % 200) + 1:03d}",
            "ts": "2026-02-15T18:10:00Z",
            "lat": -12.0464,
            "lng": -77.0428,
            "accuracy": 6,
            "speed": 1.2,
            "heading": 120,
            "battery": 80,
            "seq": i,
        }
        return post_json(url, headers, payload)

    counts: Counter = Counter()
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(send, i) for i in range(1, total + 1)]
        for future in as_completed(futures):
            counts[future.result()] += 1
    return counts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["forms", "tracking"])
    parser.add_argument("--total", type=int, default=2500)
    parser.add_argument("--workers", type=int, default=40)
    parser.add_argument("--prefix", type=str, default="ops")
    args = parser.parse_args()

    if args.mode == "forms":
        result = run_forms(args.total, args.workers, args.prefix)
        print("forms_status", dict(result))
        return

    result = run_tracking(args.total, args.workers, args.prefix)
    print("tracking_status", dict(result))


if __name__ == "__main__":
    main()

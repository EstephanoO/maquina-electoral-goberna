#!/usr/bin/env python3

import json
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Tuple
from urllib.request import Request, urlopen
from urllib.error import HTTPError


def main() -> None:
    text = Path("/srv/app/.env").read_text()
    token = ""
    for line in text.splitlines():
        if line.startswith("AGENT_INGEST_TOKEN="):
            token = line.split("=", 1)[1].strip().replace('"', "").replace("'", "")
            break

    headers = {"Content-Type": "application/json", "x-agent-token": token}
    url = "http://127.0.0.1/api/agents/location"
    latencies = []
    status: Dict[int, int] = {}

    start = time.perf_counter()

    def send(i: int) -> Tuple[int, float]:
        payload = {
            "agent_id": f"phone-sim-{i:03d}",
            "ts": "2026-02-15T20:10:00Z",
            "lat": -12.0464,
            "lng": -77.0428,
            "accuracy": 8,
            "seq": 1000 + i,
        }
        req = Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
        t0 = time.perf_counter()
        try:
            with urlopen(req, timeout=10) as resp:
                code = resp.status
        except HTTPError as err:
            code = err.code
        ms = (time.perf_counter() - t0) * 1000
        return code, ms

    with ThreadPoolExecutor(max_workers=25) as executor:
        futures = [executor.submit(send, i) for i in range(1, 51)]
        for future in as_completed(futures):
            code, ms = future.result()
            status[code] = status.get(code, 0) + 1
            latencies.append(ms)

    total_ms = (time.perf_counter() - start) * 1000
    latencies.sort()

    def quantile(p: int) -> float:
        if not latencies:
            return 0.0
        idx = max(0, min(len(latencies) - 1, int((p / 100) * (len(latencies) - 1))))
        return round(latencies[idx], 2)

    print(
        json.dumps(
            {
                "requests": 50,
                "status": status,
                "p50_ms": quantile(50),
                "p90_ms": quantile(90),
                "p95_ms": quantile(95),
                "p99_ms": quantile(99),
                "max_ms": round(latencies[-1], 2) if latencies else 0.0,
                "wall_ms": round(total_ms, 2),
            }
        )
    )


if __name__ == "__main__":
    main()

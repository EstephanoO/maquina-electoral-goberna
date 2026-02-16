#!/usr/bin/env node

const baseUrl = process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:3000";
const endpoint = `${baseUrl.replace(/\/$/, "")}/api/agents/location`;
const token = process.env.AGENT_INGEST_TOKEN ?? "";

const concurrency = Number(process.env.CONCURRENCY ?? 100);
const durationSeconds = Number(process.env.DURATION_SECONDS ?? 30);
const agentCount = Number(process.env.AGENT_COUNT ?? 100);
const agentPrefix = process.env.AGENT_PREFIX ?? `bench-agent-${Date.now()}`;

if (!Number.isFinite(concurrency) || concurrency <= 0) {
  throw new Error("CONCURRENCY invalido");
}

if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
  throw new Error("DURATION_SECONDS invalido");
}

if (!Number.isFinite(agentCount) || agentCount <= 0) {
  throw new Error("AGENT_COUNT invalido");
}

const endAt = Date.now() + durationSeconds * 1000;
const seqByAgent = new Map();
const latencies = [];
const statusCounters = {};

function quantile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const idx = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return Number((sortedValues[idx] ?? 0).toFixed(2));
}

function nextPayload(workerId) {
  const agentId = `${agentPrefix}-${String((workerId % agentCount) + 1).padStart(3, "0")}`;
  const seq = (seqByAgent.get(agentId) ?? 0) + 1;
  seqByAgent.set(agentId, seq);

  const jitter = (workerId % 20) * 0.0001;

  return {
    agent_id: agentId,
    ts: new Date().toISOString(),
    lat: -12.0464 + jitter,
    lng: -77.0428 - jitter,
    accuracy: 6 + (workerId % 5),
    speed: 1.2,
    heading: 120,
    battery: 80,
    seq,
  };
}

async function worker(workerId) {
  while (Date.now() < endAt) {
    const payload = nextPayload(workerId);
    const started = performance.now();

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-agent-token": token } : {}),
        },
        body: JSON.stringify(payload),
      });

      const elapsed = performance.now() - started;
      latencies.push(elapsed);
      const statusKey = String(response.status);
      statusCounters[statusKey] = (statusCounters[statusKey] ?? 0) + 1;
    } catch {
      const statusKey = "network_error";
      statusCounters[statusKey] = (statusCounters[statusKey] ?? 0) + 1;
    }
  }
}

const workers = [];
for (let i = 0; i < concurrency; i += 1) {
  workers.push(worker(i));
}

console.log(`[load-test] starting ${concurrency} workers for ${durationSeconds}s against ${endpoint}`);
console.log(`[load-test] agent prefix: ${agentPrefix}`);
await Promise.all(workers);

const sorted = [...latencies].sort((a, b) => a - b);
const totalRequests = Object.values(statusCounters).reduce((acc, value) => acc + value, 0);

console.log("[load-test] done");
console.log(JSON.stringify({
  endpoint,
  concurrency,
  duration_seconds: durationSeconds,
  agent_count: agentCount,
  agent_prefix: agentPrefix,
  total_requests: totalRequests,
  status_counters: statusCounters,
  latency_ms: {
    p50: quantile(sorted, 50),
    p90: quantile(sorted, 90),
    p95: quantile(sorted, 95),
    p99: quantile(sorted, 99),
    max: Number((sorted[sorted.length - 1] ?? 0).toFixed(2)),
  },
}, null, 2));

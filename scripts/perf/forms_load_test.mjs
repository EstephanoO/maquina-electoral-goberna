#!/usr/bin/env node

const baseUrl = process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:3000";
const endpoint = `${baseUrl.replace(/\/$/, "")}/api/forms`;

const concurrency = Number(process.env.CONCURRENCY ?? 100);
const durationSeconds = Number(process.env.DURATION_SECONDS ?? 30);
const workerCount = Number(process.env.WORKER_COUNT ?? 100);
const mode = (process.env.MODE ?? "unique").toLowerCase();
const prefix = process.env.CLIENT_ID_PREFIX ?? `bench-forms-${Date.now()}`;

if (!Number.isFinite(concurrency) || concurrency <= 0) throw new Error("CONCURRENCY invalido");
if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("DURATION_SECONDS invalido");
if (!Number.isFinite(workerCount) || workerCount <= 0) throw new Error("WORKER_COUNT invalido");
if (!["unique", "idempotent"].includes(mode)) throw new Error("MODE invalido: usar unique o idempotent");

const endAt = Date.now() + durationSeconds * 1000;
const latencies = [];
const statusCounters = {};
const dedupeCounters = { deduped: 0, accepted: 0 };
let uniqueSeq = 0;

function quantile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const idx = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return Number((sortedValues[idx] ?? 0).toFixed(2));
}

function buildPayload(workerId) {
  const nowIso = new Date().toISOString();

  let clientId;
  if (mode === "idempotent") {
    clientId = `${prefix}-worker-${String(workerId % workerCount).padStart(3, "0")}`;
  } else {
    uniqueSeq += 1;
    clientId = `${prefix}-${String(workerId).padStart(3, "0")}-${uniqueSeq}`;
  }

  return {
    nombre: "Benchmark Form",
    telefono: "999000000",
    fecha: nowIso,
    x: 279854,
    y: 8661420,
    zona: "18S",
    candidate: "Benchmark",
    encuestador: `worker-${workerId}`,
    encuestador_id: `worker-${workerId}`,
    candidato_preferido: "Benchmark",
    client_id: clientId,
  };
}

async function worker(workerId) {
  while (Date.now() < endAt) {
    const payload = buildPayload(workerId);
    const started = performance.now();

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const elapsed = performance.now() - started;
      latencies.push(elapsed);

      const statusKey = String(response.status);
      statusCounters[statusKey] = (statusCounters[statusKey] ?? 0) + 1;

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (data && typeof data === "object") {
        if ((data.deduped ?? 0) > 0) {
          dedupeCounters.deduped += 1;
        } else {
          dedupeCounters.accepted += 1;
        }
      }
    } catch {
      statusCounters.network_error = (statusCounters.network_error ?? 0) + 1;
    }
  }
}

const workers = [];
for (let i = 0; i < concurrency; i += 1) {
  workers.push(worker(i));
}

console.log(`[forms-load-test] start ${concurrency} workers for ${durationSeconds}s mode=${mode} endpoint=${endpoint}`);
console.log(`[forms-load-test] client_id prefix: ${prefix}`);
await Promise.all(workers);

const sorted = [...latencies].sort((a, b) => a - b);
const totalRequests = Object.values(statusCounters).reduce((acc, value) => acc + value, 0);

console.log("[forms-load-test] done");
console.log(
  JSON.stringify(
    {
      endpoint,
      concurrency,
      duration_seconds: durationSeconds,
      mode,
      worker_count: workerCount,
      client_id_prefix: prefix,
      total_requests: totalRequests,
      status_counters: statusCounters,
      request_outcomes: dedupeCounters,
      latency_ms: {
        p50: quantile(sorted, 50),
        p90: quantile(sorted, 90),
        p95: quantile(sorted, 95),
        p99: quantile(sorted, 99),
        max: Number((sorted[sorted.length - 1] ?? 0).toFixed(2)),
      },
    },
    null,
    2,
  ),
);

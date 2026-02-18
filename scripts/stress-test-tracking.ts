#!/usr/bin/env bun
/**
 * Stress Test: 50 agents sending tracking + forms simultaneously
 * 
 * Simulates:
 * - 50 agents sending GPS locations every 2 seconds (batch of 5 locations each)
 * - 50 agents sending forms every 5 seconds
 * - Duration: 60 seconds
 * 
 * Run: bun scripts/stress-test-tracking.ts
 */

const API_BASE = process.env.API_BASE || "http://161.132.39.165";
const AGENT_TOKEN = process.env.AGENT_TOKEN || "";
const NUM_AGENTS = 50;
const DURATION_MS = 60_000;
const LOCATION_INTERVAL_MS = 2_000;
const FORM_INTERVAL_MS = 5_000;
const LOCATIONS_PER_BATCH = 5;

// Generate UUIDs
function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Generate random coordinates around Lima, Peru
function randomCoords(): { lat: number; lng: number } {
  const baseLat = -12.0464;
  const baseLng = -77.0428;
  return {
    lat: baseLat + (Math.random() - 0.5) * 0.1,
    lng: baseLng + (Math.random() - 0.5) * 0.1,
  };
}

// Stats
const stats = {
  locationBatches: { sent: 0, success: 0, failed: 0 },
  forms: { sent: 0, success: 0, failed: 0 },
  latencies: {
    locations: [] as number[],
    forms: [] as number[],
  },
  errors: new Map<string, number>(),
};

// Create agents
const agents = Array.from({ length: NUM_AGENTS }, () => ({
  id: uuid(),
  name: `Agent-${Math.random().toString(36).slice(2, 8)}`,
  seq: 0,
  coords: randomCoords(),
}));

console.log(`\n🚀 Starting stress test with ${NUM_AGENTS} agents for ${DURATION_MS / 1000}s\n`);
console.log(`   API: ${API_BASE}`);
console.log(`   Token: ${AGENT_TOKEN ? "✓ configured" : "✗ missing (set AGENT_TOKEN env var)"}`);
console.log(`   Locations: every ${LOCATION_INTERVAL_MS}ms (batch of ${LOCATIONS_PER_BATCH})`);
console.log(`   Forms: every ${FORM_INTERVAL_MS}ms\n`);

if (!AGENT_TOKEN) {
  console.error("❌ AGENT_TOKEN is required. Get it from production .env");
  process.exit(1);
}

// Send location batch
async function sendLocationBatch(agent: typeof agents[0]): Promise<void> {
  const locations = Array.from({ length: LOCATIONS_PER_BATCH }, () => {
    agent.seq++;
    // Simulate movement
    agent.coords.lat += (Math.random() - 0.5) * 0.001;
    agent.coords.lng += (Math.random() - 0.5) * 0.001;
    
    return {
      agent_id: agent.id,
      ts: new Date().toISOString(),
      lat: agent.coords.lat,
      lng: agent.coords.lng,
      accuracy: 5 + Math.random() * 20,
      speed: Math.random() * 5,
      heading: Math.random() * 360,
      battery: 50 + Math.floor(Math.random() * 50),
      seq: agent.seq,
    };
  });

  const start = performance.now();
  stats.locationBatches.sent++;

  try {
    const res = await fetch(`${API_BASE}/api/agents/locations/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-token": AGENT_TOKEN,
      },
      body: JSON.stringify({ locations }),
    });

    const latency = performance.now() - start;
    stats.latencies.locations.push(latency);

    if (res.ok) {
      stats.locationBatches.success++;
    } else {
      stats.locationBatches.failed++;
      const text = await res.text();
      const key = `locations:${res.status}`;
      stats.errors.set(key, (stats.errors.get(key) || 0) + 1);
    }
  } catch (err) {
    stats.locationBatches.failed++;
    const key = `locations:network`;
    stats.errors.set(key, (stats.errors.get(key) || 0) + 1);
  }
}

// Send form - uses flat structure matching backend schema
async function sendForm(agent: typeof agents[0]): Promise<void> {
  const form = {
    client_id: uuid(),
    // Flat fields that backend expects (see forms/schema.ts)
    nombre: `Test User ${Math.random().toString(36).slice(2, 8)}`,
    telefono: `9${Math.floor(10000000 + Math.random() * 90000000)}`,
    fecha: new Date().toISOString(),
    x: agent.coords.lng * 111320, // Approximate UTM easting
    y: agent.coords.lat * 110540, // Approximate UTM northing
    zona: "18S",
    candidato_preferido: "Stress Test Candidate",
    encuestador: agent.name,
    encuestador_id: agent.id,
    comentarios: "Stress test form submission",
    lat: agent.coords.lat,
    lng: agent.coords.lng,
  };

  const start = performance.now();
  stats.forms.sent++;

  try {
    const res = await fetch(`${API_BASE}/api/forms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-token": AGENT_TOKEN,
      },
      body: JSON.stringify(form),
    });

    const latency = performance.now() - start;
    stats.latencies.forms.push(latency);

    if (res.ok) {
      stats.forms.success++;
    } else {
      stats.forms.failed++;
      const text = await res.text();
      const key = `forms:${res.status}`;
      stats.errors.set(key, (stats.errors.get(key) || 0) + 1);
    }
  } catch (err) {
    stats.forms.failed++;
    const key = `forms:network`;
    stats.errors.set(key, (stats.errors.get(key) || 0) + 1);
  }
}

// Progress reporter
function reportProgress(): void {
  const locRate = stats.locationBatches.success / (Date.now() - startTime) * 1000;
  const formRate = stats.forms.success / (Date.now() - startTime) * 1000;
  
  process.stdout.write(
    `\r📊 Locations: ${stats.locationBatches.success}/${stats.locationBatches.sent} (${locRate.toFixed(1)}/s) | ` +
    `Forms: ${stats.forms.success}/${stats.forms.sent} (${formRate.toFixed(1)}/s) | ` +
    `Errors: ${stats.locationBatches.failed + stats.forms.failed}   `
  );
}

// Percentile calculator
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// Main
const startTime = Date.now();
const endTime = startTime + DURATION_MS;

// Start location senders
const locationIntervals = agents.map((agent) =>
  setInterval(() => {
    if (Date.now() < endTime) sendLocationBatch(agent);
  }, LOCATION_INTERVAL_MS)
);

// Start form senders (staggered start)
const formIntervals = agents.map((agent, i) =>
  setTimeout(() => {
    if (Date.now() >= endTime) return;
    sendForm(agent);
    return setInterval(() => {
      if (Date.now() < endTime) sendForm(agent);
    }, FORM_INTERVAL_MS);
  }, i * 100) // Stagger by 100ms each
);

// Progress reporter
const progressInterval = setInterval(reportProgress, 1000);

// Wait for completion
await new Promise((resolve) => setTimeout(resolve, DURATION_MS + 2000));

// Cleanup
locationIntervals.forEach(clearInterval);
formIntervals.forEach((id) => {
  if (typeof id === "number") clearTimeout(id);
  else if (id) clearInterval(id as unknown as number);
});
clearInterval(progressInterval);

// Final report
console.log("\n\n" + "=".repeat(60));
console.log("📈 STRESS TEST RESULTS");
console.log("=".repeat(60));

console.log("\n📍 LOCATIONS:");
console.log(`   Batches sent:    ${stats.locationBatches.sent}`);
console.log(`   Batches success: ${stats.locationBatches.success}`);
console.log(`   Batches failed:  ${stats.locationBatches.failed}`);
console.log(`   Success rate:    ${((stats.locationBatches.success / stats.locationBatches.sent) * 100).toFixed(1)}%`);
console.log(`   Total locations: ${stats.locationBatches.sent * LOCATIONS_PER_BATCH}`);

if (stats.latencies.locations.length > 0) {
  console.log(`   Latency p50:     ${percentile(stats.latencies.locations, 50).toFixed(0)}ms`);
  console.log(`   Latency p90:     ${percentile(stats.latencies.locations, 90).toFixed(0)}ms`);
  console.log(`   Latency p99:     ${percentile(stats.latencies.locations, 99).toFixed(0)}ms`);
}

console.log("\n📝 FORMS:");
console.log(`   Sent:            ${stats.forms.sent}`);
console.log(`   Success:         ${stats.forms.success}`);
console.log(`   Failed:          ${stats.forms.failed}`);
console.log(`   Success rate:    ${((stats.forms.success / stats.forms.sent) * 100).toFixed(1)}%`);

if (stats.latencies.forms.length > 0) {
  console.log(`   Latency p50:     ${percentile(stats.latencies.forms, 50).toFixed(0)}ms`);
  console.log(`   Latency p90:     ${percentile(stats.latencies.forms, 90).toFixed(0)}ms`);
  console.log(`   Latency p99:     ${percentile(stats.latencies.forms, 99).toFixed(0)}ms`);
}

if (stats.errors.size > 0) {
  console.log("\n❌ ERRORS:");
  for (const [key, count] of stats.errors.entries()) {
    console.log(`   ${key}: ${count}`);
  }
}

// Check backend health after test
console.log("\n🏥 BACKEND HEALTH:");
try {
  const health = await fetch(`${API_BASE}/api/agents/health`).then((r) => r.json());
  console.log(`   Online agents:   ${health.online_agents}`);
  console.log(`   Queue depth:     ${health.queue_depth}`);
  console.log(`   SSE clients:     ${health.sse_clients}`);
  console.log(`   Last flush:      ${health.last_flush_duration_ms}ms`);
} catch (err) {
  console.log(`   ❌ Could not fetch health`);
}

console.log("\n" + "=".repeat(60));
console.log("✅ Stress test completed");
console.log("=".repeat(60) + "\n");

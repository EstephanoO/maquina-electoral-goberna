type CounterMap = Record<string, Record<string, number>>;
type GaugeMap = Record<string, number>;

const MAX_LATENCY_SAMPLES = 8000;

export class MetricsRegistry {
  private readonly counters: CounterMap = {};
  private readonly gauges: GaugeMap = {};
  private readonly latencyByEndpoint = new Map<string, number[]>();

  incCounter(metric: string, label: string, by = 1) {
    if (!this.counters[metric]) {
      this.counters[metric] = {};
    }
    this.counters[metric][label] = (this.counters[metric][label] ?? 0) + by;
  }

  setGauge(name: string, value: number) {
    this.gauges[name] = Number.isFinite(value) ? value : 0;
  }

  observeLatency(endpoint: string, ms: number) {
    const bucket = this.latencyByEndpoint.get(endpoint) ?? [];
    bucket.push(ms);
    if (bucket.length > MAX_LATENCY_SAMPLES) {
      bucket.splice(0, bucket.length - MAX_LATENCY_SAMPLES);
    }
    this.latencyByEndpoint.set(endpoint, bucket);
  }

  private quantile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return Number((sorted[idx] ?? 0).toFixed(2));
  }

  snapshot() {
    const latencies: Record<string, { count: number; p50_ms: number; p95_ms: number; p99_ms: number }> = {};

    for (const [endpoint, samples] of this.latencyByEndpoint.entries()) {
      latencies[endpoint] = {
        count: samples.length,
        p50_ms: this.quantile(samples, 50),
        p95_ms: this.quantile(samples, 95),
        p99_ms: this.quantile(samples, 99),
      };
    }

    return {
      ts: new Date().toISOString(),
      counters: this.counters,
      gauges: this.gauges,
      latencies,
    };
  }
}

export const metricsRegistry = new MetricsRegistry();

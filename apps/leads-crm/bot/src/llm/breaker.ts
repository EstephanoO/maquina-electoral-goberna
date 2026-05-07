/**
 * Circuit breaker mínimo para llamadas LLM (Gemini, OpenAI, embeddings).
 *
 * Estados:
 *   - closed:    deja pasar todo, cuenta fails. Si fails > threshold en window → open.
 *   - open:      fail-fast inmediato durante coolDownMs. Tras cooldown → half-open.
 *   - half-open: deja pasar 1 probe. Si ok → closed. Si fail → open de nuevo.
 *
 * Por qué custom y no `opossum`: 30 LOC vs 100KB de dep + sus types incómodos
 * en ESM. Para lo que necesitamos (3 endpoints LLM), alcanza.
 *
 * Logging: opcional. Si pasás `onStateChange`, el caller decide cómo loguear
 * (pino estructurado, console, ring buffer, lo que sea).
 */

export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerOptions {
  /** Cuántos fails consecutivos en el window antes de abrir. Default 5. */
  failureThreshold?: number;
  /** Ventana donde se cuentan los fails (ms). Default 30s. */
  windowMs?: number;
  /** Tiempo que el breaker queda abierto antes de probar (ms). Default 60s. */
  coolDownMs?: number;
  /** Hook opcional para telemetría (ej. log a pino o métricas). */
  onStateChange?: (from: BreakerState, to: BreakerState, name: string) => void;
}

export class CircuitBreaker {
  private state: BreakerState = "closed";
  private failures: number[] = []; // timestamps
  private openedAt = 0;
  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly coolDownMs: number;
  private readonly onStateChange?: BreakerOptions["onStateChange"];

  constructor(public readonly name: string, opts: BreakerOptions = {}) {
    this.threshold = opts.failureThreshold ?? 5;
    this.windowMs = opts.windowMs ?? 30_000;
    this.coolDownMs = opts.coolDownMs ?? 60_000;
    this.onStateChange = opts.onStateChange;
  }

  /** Llama fn() respetando el estado. Si está open, lanza BreakerOpenError. */
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    if (this.state === "open") {
      if (now - this.openedAt < this.coolDownMs) {
        throw new BreakerOpenError(this.name, this.coolDownMs - (now - this.openedAt));
      }
      this.transition("half-open");
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }

  private onSuccess(): void {
    if (this.state === "half-open") this.transition("closed");
    this.failures = [];
  }

  private onFailure(): void {
    const now = Date.now();
    if (this.state === "half-open") {
      this.transition("open");
      this.openedAt = now;
      return;
    }
    // closed: count fail + maybe open
    this.failures.push(now);
    this.failures = this.failures.filter(ts => now - ts < this.windowMs);
    if (this.failures.length >= this.threshold) {
      this.transition("open");
      this.openedAt = now;
      this.failures = [];
    }
  }

  private transition(to: BreakerState): void {
    if (this.state === to) return;
    const from = this.state;
    this.state = to;
    this.onStateChange?.(from, to, this.name);
  }

  /** Estado actual + tiempo restante de cooldown si está open. Para /health. */
  status(): { state: BreakerState; failuresInWindow: number; cooldownRemainingMs: number } {
    const cooldownRemainingMs = this.state === "open"
      ? Math.max(0, this.coolDownMs - (Date.now() - this.openedAt))
      : 0;
    return { state: this.state, failuresInWindow: this.failures.length, cooldownRemainingMs };
  }
}

export class BreakerOpenError extends Error {
  constructor(public readonly breakerName: string, public readonly retryInMs: number) {
    super(`circuit_open:${breakerName}:retry_in_${retryInMs}ms`);
    this.name = "BreakerOpenError";
  }
}

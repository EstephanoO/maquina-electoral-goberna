import pRetry, { AbortError } from "p-retry";
import { CircuitBreaker, BreakerOpenError } from "./breaker.js";

/**
 * Fetch resiliente para LLMs: combina circuit breaker + retry con jitter +
 * timeout por intento. Retornable como `{ ok, data }` para que los callers
 * (gemini.ts, openai.ts) sigan exponiendo la misma shape externa.
 *
 * Política de retry:
 *   - Reintentamos fallos de red (timeout / abort / fetch_failed) y 5xx / 429.
 *   - NO reintentamos 4xx (excepto 429): bad request es bad request, retry no
 *     lo va a arreglar y solo gasta cuota.
 *   - 429 explícito → respetamos Retry-After si viene; si no, exponential.
 *
 * Política de breaker:
 *   - 5 fails en 30s → open 60s. Durante open, BreakerOpenError fail-fast (no
 *     consume cuota ni latencia, los callers caen al fallback inmediato).
 */

export interface ResilientFetchOptions {
  /** Timeout por intento individual (no acumulado). Default 8s. */
  timeoutMs?: number;
  /** Cuántos intentos totales (1 = solo el primero, sin retry). Default 3. */
  retries?: number;
  /** Mínimo backoff entre intentos (ms). Default 200ms. */
  minBackoffMs?: number;
  /** Máximo backoff entre intentos (ms). Default 2s. */
  maxBackoffMs?: number;
  /** Hook que recibe cada error reintentable (telemetría). */
  onRetry?: (err: Error, attempt: number) => void;
}

export type ResilientResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; status?: number; breakerOpen?: boolean };

/** Errores HTTP no-retryable: 400/401/403/404. 429 sí se reintenta. */
function isNonRetryableHttpStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}

/**
 * Wrapper que ejecuta `doFetch()` (que devuelve `{ ok, data | reason, status? }`)
 * dentro de un breaker + retry. Si todos los intentos fallan, devuelve el
 * último error formateado. Si el breaker está open, devuelve breakerOpen=true
 * para que el caller pueda decidir saltar al fallback sin loguear ruido.
 */
export async function resilientFetch<T>(
  breaker: CircuitBreaker,
  doFetch: (signal: AbortSignal) => Promise<ResilientResult<T>>,
  opts: ResilientFetchOptions = {},
): Promise<ResilientResult<T>> {
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const retries = opts.retries ?? 3;
  const minBackoffMs = opts.minBackoffMs ?? 200;
  const maxBackoffMs = opts.maxBackoffMs ?? 2_000;

  try {
    return await breaker.exec(async () =>
      pRetry(
        async (attempt: number) => {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), timeoutMs);
          try {
            const result = await doFetch(ctrl.signal);
            if (result.ok) return result;
            // Non-retryable HTTP → AbortError (p-retry NO reintenta)
            if (typeof result.status === "number" && isNonRetryableHttpStatus(result.status)) {
              throw new AbortError(`http_${result.status}:${result.reason}`);
            }
            // Retryable → throw simple Error (p-retry reintenta con backoff)
            throw new Error(`${result.status ?? "fetch"}:${result.reason}`);
          } finally {
            clearTimeout(t);
          }
        },
        {
          retries: Math.max(0, retries - 1),
          minTimeout: minBackoffMs,
          maxTimeout: maxBackoffMs,
          factor: 2,
          randomize: true, // jitter para evitar thundering herd
          onFailedAttempt: (ctx) => opts.onRetry?.(ctx.error, ctx.attemptNumber),
        },
      ),
    );
  } catch (e: any) {
    if (e instanceof BreakerOpenError) {
      return { ok: false, reason: `breaker_open:${e.breakerName}`, breakerOpen: true };
    }
    // p-retry termina con AggregateError o el último Error. Saco el reason "limpio".
    const msg: string = e?.message ?? "fetch_failed";
    const m = msg.match(/^(\d+):(.+)$/);
    if (m) return { ok: false, reason: m[2], status: Number(m[1]) };
    return { ok: false, reason: msg };
  }
}

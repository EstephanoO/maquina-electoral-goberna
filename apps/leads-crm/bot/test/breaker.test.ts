import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CircuitBreaker, BreakerOpenError } from "../src/llm/breaker.js";

describe("CircuitBreaker", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("queda closed mientras los fails no superen el threshold", async () => {
    const b = new CircuitBreaker("test", { failureThreshold: 3, windowMs: 30_000, coolDownMs: 1_000 });
    for (let i = 0; i < 2; i++) {
      await expect(b.exec(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    }
    expect(b.status().state).toBe("closed");
    expect(b.status().failuresInWindow).toBe(2);
  });

  it("abre el breaker después del threshold y fail-fast con BreakerOpenError", async () => {
    const b = new CircuitBreaker("test", { failureThreshold: 3, windowMs: 30_000, coolDownMs: 1_000 });
    for (let i = 0; i < 3; i++) {
      await expect(b.exec(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    }
    expect(b.status().state).toBe("open");
    // Próxima llamada → fail-fast, NO ejecuta fn
    const fn = vi.fn(async () => "should not run");
    await expect(b.exec(fn)).rejects.toBeInstanceOf(BreakerOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("transiciona open→half-open→closed cuando el probe es exitoso", async () => {
    const b = new CircuitBreaker("test", { failureThreshold: 2, windowMs: 30_000, coolDownMs: 1_000 });
    await expect(b.exec(async () => { throw new Error("e"); })).rejects.toThrow();
    await expect(b.exec(async () => { throw new Error("e"); })).rejects.toThrow();
    expect(b.status().state).toBe("open");

    // Pasar el cooldown
    vi.advanceTimersByTime(1_500);
    // Probe exitoso → vuelve a closed
    const result = await b.exec(async () => "ok");
    expect(result).toBe("ok");
    expect(b.status().state).toBe("closed");
  });

  it("vuelve a open si el probe en half-open falla", async () => {
    const b = new CircuitBreaker("test", { failureThreshold: 1, windowMs: 30_000, coolDownMs: 500 });
    await expect(b.exec(async () => { throw new Error("e"); })).rejects.toThrow();
    expect(b.status().state).toBe("open");
    vi.advanceTimersByTime(600);
    // Probe falla → vuelve a open
    await expect(b.exec(async () => { throw new Error("still broken"); })).rejects.toThrow("still broken");
    expect(b.status().state).toBe("open");
  });
});

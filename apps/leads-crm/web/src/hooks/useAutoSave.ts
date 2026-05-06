import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Collects partial patches, debounces, and calls `save(mergedPatch)`.
 *
 * schedule(partial, delayMs) merges the partial and (re)starts the timer.
 * Multiple calls within the delay collapse into one save.
 *
 * Returns an object with:
 *   - schedule(patch, delay)
 *   - flushNow() — force save now
 *   - status: "idle" | "saving" | "saved" | "error"
 *   - error: last error message
 */
export function useAutoSave<TPatch extends object>(save: (patch: TPatch) => Promise<void>) {
  const pendingRef = useRef<TPatch>({} as TPatch);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const flush = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (inflightRef.current) await inflightRef.current;
    const patch = pendingRef.current;
    if (Object.keys(patch).length === 0) return;
    pendingRef.current = {} as TPatch;

    setStatus("saving");
    setError(null);
    inflightRef.current = (async () => {
      try {
        await save(patch);
        setStatus("saved");
        setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch (e: any) {
        setStatus("error");
        setError(e?.message ?? "Error");
        // Re-merge failed patch so next save retries
        pendingRef.current = { ...patch, ...pendingRef.current };
      } finally {
        inflightRef.current = null;
        // If more piled up, flush again
        if (Object.keys(pendingRef.current).length > 0) {
          setTimeout(flush, 100);
        }
      }
    })();
    return inflightRef.current;
  }, [save]);

  const schedule = useCallback((patch: Partial<TPatch>, delay = 500) => {
    pendingRef.current = { ...pendingRef.current, ...patch };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, delay);
    setStatus("saving");
  }, [flush]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { schedule, flushNow: flush, status, error };
}

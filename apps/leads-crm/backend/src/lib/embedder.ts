/**
 * Embedder server-side — wrap Gemini gemini-embedding-001 (Matryoshka 768).
 *
 * Llamado por las rutas de templates/rules cuando se crean o editan, y
 * por scripts de backfill. Cache LRU se justifica porque al editar un
 * template la UI puede dispararse 2-3 veces (typing debounce).
 *
 * No replica el cache del bot — son procesos separados, cada uno con su LRU.
 */
const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
export const EMBED_DIMENSIONS = 768;

const TIMEOUT_MS = 8_000;

type EmbedCacheEntry = { vec: number[]; ts: number };
const cache = new Map<string, EmbedCacheEntry>();
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 500;

export type EmbedResult =
  | { ok: true; vec: number[]; cached: boolean }
  | { ok: false; reason: string; status?: number };

export function embedderAvailable(): boolean {
  return API_KEY.length > 0;
}

export async function embed(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_DOCUMENT",
): Promise<EmbedResult> {
  if (!API_KEY) return { ok: false, reason: "no_api_key" };
  if (!text || !text.trim()) return { ok: false, reason: "empty_text" };

  const norm = text.trim().slice(0, 2048);
  const key = `${taskType}::${norm.slice(0, 256)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return { ok: true, vec: hit.vec, cached: true };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${API_KEY}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${MODEL}`,
        content: { parts: [{ text: norm }] },
        taskType,
        outputDimensionality: EMBED_DIMENSIONS,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) {
      const j: any = await r.json().catch(() => ({}));
      return { ok: false, reason: j?.error?.message || `http_${r.status}`, status: r.status };
    }
    const j: any = await r.json();
    const vec = j?.embedding?.values;
    if (!Array.isArray(vec) || vec.length !== EMBED_DIMENSIONS) {
      return { ok: false, reason: `bad_response_dims:${vec?.length ?? 0}` };
    }
    cache.set(key, { vec, ts: Date.now() });
    if (cache.size > CACHE_MAX) {
      const cutoff = Date.now() - CACHE_TTL_MS;
      for (const [k, v] of cache.entries()) {
        if (v.ts < cutoff) cache.delete(k);
        if (cache.size <= CACHE_MAX * 0.8) break;
      }
    }
    return { ok: true, vec, cached: false };
  } catch (e: any) {
    clearTimeout(t);
    return { ok: false, reason: e?.message || "fetch_failed" };
  }
}

/** Format vector array como literal pgvector ('[0.1,0.2,...]'). */
export function vecToPg(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

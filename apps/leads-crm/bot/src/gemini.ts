/**
 * Gemini integration: cuando no matchea template y la key está disponible,
 * generamos una respuesta natural usando contexto del prompt_override.
 *
 * Resilience (Sprint 1.1, 2026-05-07):
 *   - Circuit breaker (5 fails / 30s → open 60s) por endpoint
 *   - Retry con jitter (3 intentos, 200ms→2s) en 5xx + 429 + network errors
 *   - 4xx (bad request, 401, 403) NO se reintentan
 *
 * Si Gemini falla todo (breaker open o todos los retries quemados),
 * los callers caen al holding sin ruido.
 */
import { CircuitBreaker } from "./llm/breaker.js";
import { resilientFetch, type ResilientResult } from "./llm/resilient-fetch.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const API_KEY = process.env.GEMINI_API_KEY || "";

export type GeminiResult =
  | { ok: true; text: string; model: string }
  | { ok: false; reason: string; status?: number };

const TIMEOUT_MS = 8_000;

const generateBreaker = new CircuitBreaker("gemini-generate", {
  onStateChange: (from, to, name) => {
    console.warn(`[breaker:${name}] ${from} → ${to}`);
  },
});
const embedBreaker = new CircuitBreaker("gemini-embed", {
  onStateChange: (from, to, name) => {
    console.warn(`[breaker:${name}] ${from} → ${to}`);
  },
});

export async function generateReply(opts: {
  systemPrompt: string;
  userMessage: string;
  history?: Array<{ role: "user" | "model"; text: string }>;
}): Promise<GeminiResult> {
  if (!API_KEY) return { ok: false, reason: "no_api_key" };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const contents: any[] = [];
  if (opts.history) {
    for (const h of opts.history) contents.push({ role: h.role, parts: [{ text: h.text }] });
  }
  contents.push({ role: "user", parts: [{ text: opts.userMessage }] });

  const payload = {
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    contents,
    generationConfig: {
      thinkingConfig: { thinkingBudget: 0 },     // Lite/Flash: thinking off para latencia baja
      maxOutputTokens: 400,
      temperature: 0.6,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
  };

  const result = await resilientFetch<{ text: string; model: string }>(
    generateBreaker,
    async (signal): Promise<ResilientResult<{ text: string; model: string }>> => {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });
      if (!r.ok) {
        const j: any = await r.json().catch(() => ({}));
        return { ok: false, reason: j?.error?.message || `http_${r.status}`, status: r.status };
      }
      const j: any = await r.json();
      const text = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) return { ok: false, reason: "empty_response" };
      return { ok: true, data: { text, model: MODEL } };
    },
    { timeoutMs: TIMEOUT_MS, retries: 3 },
  );

  if (result.ok) return { ok: true, text: result.data.text, model: result.data.model };
  return { ok: false, reason: result.reason, status: result.status };
}

export function geminiAvailable(): boolean {
  return API_KEY.length > 0;
}

/** Estado actual del breaker — útil para /health endpoints. */
export function geminiBreakerStatus() {
  return {
    generate: generateBreaker.status(),
    embed: embedBreaker.status(),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Embeddings — gemini-embedding-001 (768 dims) para semantic search
// (template picker, intent fallback, lead memory).
//
// Free tier: 1500 RPM. Estamos en ~400 mensajes IN/día = ~17/h, lejos del límite.
// Latencia: ~80-150ms por call. Cache LRU 60s evita re-embeddear textos repetidos
// (saludos, "hola", "info", etc. que aparecen mil veces al día).
// ─────────────────────────────────────────────────────────────────────

// gemini-embedding-001 reemplazó a text-embedding-004 (deprecado mayo 2026).
// Default native dims: 3072. Pedimos outputDimensionality=768 (Matryoshka
// truncation) para mantener el schema pgvector chico — los modelos modernos
// están entrenados para que las primeras N dims sean self-contained sin
// pérdida significativa de calidad.
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
const EMBED_DIMS = 768;

type EmbedCacheEntry = { vec: number[]; ts: number };
const embedCache = new Map<string, EmbedCacheEntry>();
const EMBED_CACHE_TTL_MS = 60_000;
const EMBED_CACHE_MAX = 500;

function cacheKey(text: string, taskType: string) {
  return `${taskType}::${text.slice(0, 256)}`;
}

function trimCache() {
  if (embedCache.size <= EMBED_CACHE_MAX) return;
  const cutoff = Date.now() - EMBED_CACHE_TTL_MS;
  for (const [k, v] of embedCache.entries()) {
    if (v.ts < cutoff) embedCache.delete(k);
    if (embedCache.size <= EMBED_CACHE_MAX * 0.8) break;
  }
}

export type EmbedResult =
  | { ok: true; vec: number[]; cached: boolean }
  | { ok: false; reason: string; status?: number };

/**
 * Embed un texto con Gemini gemini-embedding-001.
 *
 * taskType: "RETRIEVAL_DOCUMENT" para textos almacenados (templates, rules,
 * historical interactions); "RETRIEVAL_QUERY" para queries en vivo (mensaje
 * entrante del lead). Gemini genera embeddings asimétricos optimizados por
 * lado — usar el correcto mejora recall vs. tirar todo a DOCUMENT.
 */
export async function embed(text: string, taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_DOCUMENT"): Promise<EmbedResult> {
  if (!API_KEY) return { ok: false, reason: "no_api_key" };
  if (!text || !text.trim()) return { ok: false, reason: "empty_text" };

  const norm = text.trim().slice(0, 2048);
  const key = cacheKey(norm, taskType);
  const hit = embedCache.get(key);
  if (hit && Date.now() - hit.ts < EMBED_CACHE_TTL_MS) {
    return { ok: true, vec: hit.vec, cached: true };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${API_KEY}`;

  const result = await resilientFetch<number[]>(
    embedBreaker,
    async (signal): Promise<ResilientResult<number[]>> => {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text: norm }] },
          taskType,
          outputDimensionality: EMBED_DIMS,
        }),
        signal,
      });
      if (!r.ok) {
        const j: any = await r.json().catch(() => ({}));
        return { ok: false, reason: j?.error?.message || `http_${r.status}`, status: r.status };
      }
      const j: any = await r.json();
      const vec = j?.embedding?.values;
      if (!Array.isArray(vec) || vec.length !== EMBED_DIMS) {
        return { ok: false, reason: `bad_response_dims:${vec?.length ?? 0}` };
      }
      return { ok: true, data: vec };
    },
    { timeoutMs: TIMEOUT_MS, retries: 3 },
  );

  if (!result.ok) return { ok: false, reason: result.reason, status: result.status };
  embedCache.set(key, { vec: result.data, ts: Date.now() });
  trimCache();
  return { ok: true, vec: result.data, cached: false };
}

/** Format vector array como literal pgvector ('[0.1,0.2,...]'). */
export function vecToPg(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export const EMBED_DIMENSIONS = EMBED_DIMS;

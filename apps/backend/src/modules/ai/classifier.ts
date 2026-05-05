/**
 * Shared Gemini classifier — used by both the public /api/ai/classify endpoint
 * and server-side flows (e.g., wa-events auto-tagging voter_profiles).
 *
 * Token-saving strategy:
 *   - In-memory LRU cache (5 min TTL, max 500 entries) deduplicates similar
 *     messages. Same text within window doesn't hit Gemini twice.
 *   - System prompt is ~200 tokens, response ~50 tokens. ~300 tokens/call.
 *   - Caller is responsible for rate limiting and skipping ambiguous cases.
 */

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CACHE_MAX = 500;
const CACHE_TTL_MS = 5 * 60 * 1000;

export type ClassifyResult = {
  vote_class: string;
  status: string;
  confidence: number;
  category: string;
  reason: string;
};

type CacheEntry = { result: ClassifyResult; ts: number };
const classifyCache = new Map<string, CacheEntry>();

export function cacheKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 300);
}

export function getCached(key: string): ClassifyResult | null {
  const entry = classifyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    classifyCache.delete(key);
    return null;
  }
  classifyCache.delete(key);
  classifyCache.set(key, entry);
  return entry.result;
}

export function setCache(key: string, result: ClassifyResult): void {
  if (classifyCache.size >= CACHE_MAX) {
    const oldest = classifyCache.keys().next().value;
    if (oldest !== undefined) classifyCache.delete(oldest);
  }
  classifyCache.set(key, { result, ts: Date.now() });
}

const SYSTEM_PROMPT = `Eres un clasificador de mensajes de WhatsApp para campañas políticas en Perú.
Clasifica el mensaje del votante en EXACTAMENTE una categoría.

Categorías (vote_class / status):
- duro/respondido: apoyo genuino, militantes, coordinadores, voluntarios organizados, sector salud apoyando, piden material de campaña para repartir
- blando/respondido: apoyo condicionado a obras, deportes, infraestructura
- flotante/respondido: consultas, indecisos, interés sin compromiso
- invalido: piden dinero/Yape/trabajo/publicidad pagada, spam

Responde SOLO JSON (sin markdown):
{"vote_class":"duro|blando|flotante","status":"respondido|invalido","confidence":0.0-1.0,"category":"keyword_corto","reason":"1 frase"}

Si no puedes clasificar con confianza >0.5, responde:
{"vote_class":"","status":"","confidence":0,"category":"no_clasificable","reason":"contexto insuficiente"}`;

export async function callGemini(
  apiKey: string,
  text: string,
  conversationContext?: string,
): Promise<ClassifyResult | null> {
  const userMessage = conversationContext
    ? `Contexto de conversación reciente:\n${conversationContext}\n\nMensaje a clasificar:\n${text}`
    : `Mensaje a clasificar:\n${text}`;

  const body = {
    contents: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + userMessage }] },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 150,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!rawText) return null;

  try {
    const parsed = JSON.parse(rawText) as Partial<ClassifyResult>;
    return {
      vote_class: parsed.vote_class ?? "",
      status: parsed.status ?? "",
      confidence: Math.max(0, Math.min(1, typeof parsed.confidence === "number" ? parsed.confidence : 0)),
      category: parsed.category ?? "ai_classified",
      reason: parsed.reason ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Classify with cache. Returns null if Gemini was unable to classify or if the
 * API key is missing — caller decides what to do with the no-result case.
 */
export async function classifyWithCache(
  apiKey: string,
  text: string,
  conversationContext?: string,
): Promise<ClassifyResult | null> {
  if (!apiKey) return null;
  const key = cacheKey(text);
  const cached = getCached(key);
  if (cached) return cached;
  const result = await callGemini(apiKey, text, conversationContext);
  if (result) setCache(key, result);
  return result;
}

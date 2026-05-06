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

const GEMINI_MODEL = "gemini-2.5-flash"; // Cambiado de flash-lite (503 congestionado en horas pico)
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

/**
 * Tipo de tenant del classifier. Determina qué SYSTEM_PROMPT usar.
 *   campaign — campañas políticas (votantes, vote_class duro/blando/flotante)
 *   business — negocio/escuela (leads de cursos, intent enrollment/inquiry/...)
 */
export type ClassifierKind = "campaign" | "business";

// ── Prompt para campañas políticas ───────────────────────────────────
const SYSTEM_PROMPT_CAMPAIGN = `Eres un clasificador de mensajes de WhatsApp para campañas políticas en Perú.
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

// ── Prompt para negocios / Goberna Escuela ───────────────────────────
//
// Goberna Escuela vende cursos/diplomas a profesionales políticos. Los inbounds
// son leads que preguntan precio, quieren inscribirse, consultan envíos, etc.
// El vocabulario "duro/blando/flotante" no aplica — usamos vote_class para
// reportar el "lead temperature" en términos de Escuela:
//
//   "duro"      → high-intent: inscripción inminente, ya pagó, hace pregunta concreta de checkout.
//   "blando"    → mid-intent:  pregunta precio o detalles del curso, considera.
//   "flotante"  → low-intent:  curiosidad genérica, comparte el material con otros sin compromiso.
//   "invalido"  → spam:        pide trabajo/dinero/publicidad, mensajes irrelevantes.
//
// Reusamos el mismo schema de output para que el storage no cambie. La category
// es el curso de interés cuando se identifica.
const SYSTEM_PROMPT_BUSINESS = `Eres un clasificador de mensajes de WhatsApp para Goberna Escuela, que vende cursos y diplomas en consultoría política, oratoria, gestión parlamentaria, marketing político, etc.

Clasifica el mensaje del lead en EXACTAMENTE una categoría:

- duro/respondido: high-intent — quiere inscribirse YA, está pagando, pregunta concreta sobre checkout/factura/envío post-compra.
- blando/respondido: mid-intent — pregunta el precio, pide detalles del curso, "estoy interesado", considera matricularse.
- flotante/respondido: low-intent — curiosidad genérica, "información", "qué ofrecen", reenvía contenido sin compromiso, "después te aviso".
- invalido: spam o no-lead — pide trabajo/dinero/publicidad/colaboración pagada, mensaje irrelevante, broadcast forward genérico.

La "category" debe ser un keyword corto que describa el TEMA del mensaje:
- nombre del curso si se menciona (ej. "oratoria", "gestion_parlamentaria", "marketing_politico")
- "consulta_precio" si pregunta costo
- "consulta_envio" si pregunta cómo le llega el material
- "consulta_horario" si pregunta cuándo
- "registro_pago" si está confirmando pago
- "negativa" si rechaza expresamente
- "no_clasificable" si no se puede determinar

Responde SOLO JSON (sin markdown):
{"vote_class":"duro|blando|flotante","status":"respondido|invalido","confidence":0.0-1.0,"category":"keyword_corto","reason":"1 frase"}

Si no puedes clasificar con confianza >0.5, responde:
{"vote_class":"","status":"","confidence":0,"category":"no_clasificable","reason":"contexto insuficiente"}`;

/** Devuelve el system prompt apropiado para el tenant kind. */
function getSystemPrompt(kind: ClassifierKind): string {
  return kind === "business" ? SYSTEM_PROMPT_BUSINESS : SYSTEM_PROMPT_CAMPAIGN;
}

export async function callGemini(
  apiKey: string,
  text: string,
  options: { conversationContext?: string; kind?: ClassifierKind } = {},
): Promise<ClassifyResult | null> {
  const { conversationContext, kind = "campaign" } = options;
  const userMessage = conversationContext
    ? `Contexto de conversación reciente:\n${conversationContext}\n\nMensaje a clasificar:\n${text}`
    : `Mensaje a clasificar:\n${text}`;

  const systemPrompt = getSystemPrompt(kind);

  const body = {
    contents: [
      { role: "user", parts: [{ text: systemPrompt + "\n\n" + userMessage }] },
    ],
    generationConfig: {
      temperature: 0.1,
      // gemini-2.5-flash usa "thinking tokens" internos por default que
      // consumen del budget. Para clasificación de texto simple no hace falta;
      // desactivamos con thinkingBudget=0 y bajamos el max real (~80 tokens
      // de output JSON suficientes).
      maxOutputTokens: 200,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
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
 *
 * Cache key incluye `kind` para que el mismo texto en contextos distintos
 * (campaign vs business) se cachee por separado.
 */
export async function classifyWithCache(
  apiKey: string,
  text: string,
  options: { conversationContext?: string; kind?: ClassifierKind } = {},
): Promise<ClassifyResult | null> {
  if (!apiKey) return null;
  const kind = options.kind ?? "campaign";
  const key = `${kind}:${cacheKey(text)}`;
  const cached = getCached(key);
  if (cached) return cached;
  const result = await callGemini(apiKey, text, options);
  if (result) setCache(key, result);
  return result;
}

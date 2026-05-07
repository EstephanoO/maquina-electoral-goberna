/**
 * Template picker: dada la salida del classifier + el instance,
 * elige el mejor template para responder.
 *
 * Heurística:
 *   1. Si matcheó un producto → buscar template en categoría "flyer" cuyo
 *      body mencione ese producto (palabra clave del nombre).
 *   2. Si NO match producto pero el body parece saludo → "saludo" template.
 *   3. Si pidió precio o info genérica → "info_curso" template (3-4 semanas).
 *   4. Si pidió medios de pago → "pago" template (la cuenta del instance).
 *   5. Default: ningún template → no responder.
 *
 * Sustituciones de variables en el template:
 *   {{curso}}            → nombre del producto matcheado
 *   {{agent_name}}       → instance.agent_name
 *   {{agent_signature}}  → instance.agent_signature
 *   {{cuenta_bancaria}}  → instance.cuenta_bancaria
 *   {{yape}}             → instance.yape_numero
 */
import type { BotInstance, Template } from "./instance-config.js";

export type PickInput = {
  body: string;                  // raw inbound text
  classifiedProducts: string[];  // from classifier.classifyMessage
  customTags: string[];          // from custom rules
  /** País del lead (derivado del prefix del phone). Filtra learned_replies
   *  para que un lead PE no reciba respuestas con $MXN. NULL = sin filter. */
  country?: string | null;
};

const GREETING_RE = /^(hola[,!.\s]|buen[oa]s?\s*(d[ií]as|tardes|noches)|hey|saludos)/i;
const PRICE_RE = /\b(precio|costo|cu[aá]nto\s*(cuesta|vale|sale|es)|inversi[oó]n)\b/i;
const PAYMENT_RE = /\b(yape|deposito|transferencia|cuenta\s*bancaria|c[oó]mo\s*pago|medios\s*de\s*pago|comprobante)\b/i;
const INFO_RE = /\b(informaci[oó]n|info|deseo\s*info|necesito\s*info|brindar.*info|detalles)\b/i;

function pickByProduct(products: string[], templates: Template[]): Template | null {
  if (products.length === 0) return null;
  const flyers = templates.filter(t => t.category === "flyer");
  for (const p of products) {
    const slug = p.toLowerCase();
    const hit = flyers.find(t => {
      const tl = t.body.toLowerCase();
      // Match by product key tokens (e.g. "parlamentari", "consultor", "ia y marketing")
      return tl.includes(slug.split(" ")[0]);
    });
    if (hit) return hit;
  }
  return null;
}

function pickByCategory(category: string, templates: Template[]): Template | null {
  const list = templates.filter(t => t.category === category);
  if (list.length === 0) return null;
  // Most-used template first (already sorted by getTemplatesByCategory if used)
  return list.sort((a, b) => b.uses_count - a.uses_count)[0];
}

export function pickTemplate(input: PickInput, allTemplates: Template[]): Template | null {
  // 1. Producto específico → flyer matching
  const fromProduct = pickByProduct(input.classifiedProducts, allTemplates);
  if (fromProduct) return fromProduct;

  // 2. Tag intent específico (custom rules) — más confiable que regex aquí
  const tagSet = new Set(input.customTags);
  if (tagSet.has("intent:brochure_pdf")) {
    const t = pickByCategory("brochure", allTemplates);
    if (t) return t;
  }
  if (tagSet.has("intent:video")) {
    const t = pickByCategory("video", allTemplates);
    if (t) return t;
  }
  if (tagSet.has("intent:pago") || tagSet.has("intent:pago_metodos")) {
    const t = pickByCategory("pago", allTemplates);
    if (t) return t;
  }
  if (tagSet.has("intent:matricula")) {
    const t = pickByCategory("inscripcion", allTemplates);
    if (t) return t;
  }
  if (tagSet.has("intent:saludo")) {
    const t = pickByCategory("saludo", allTemplates);
    if (t) return t;
  }
  if (tagSet.has("intent:precio") || tagSet.has("intent:horario_fecha") || tagSet.has("intent:info_request")) {
    const t = pickByCategory("info_curso", allTemplates);
    if (t) return t;
  }

  // 3. Regex genérico sobre body (fallback)
  if (PAYMENT_RE.test(input.body)) {
    const t = pickByCategory("pago", allTemplates);
    if (t) return t;
  }
  if (PRICE_RE.test(input.body) || INFO_RE.test(input.body)) {
    const t = pickByCategory("info_curso", allTemplates);
    if (t) return t;
  }
  if (GREETING_RE.test(input.body)) {
    const t = pickByCategory("saludo", allTemplates);
    if (t) return t;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Semantic picker — fallback cuando el cascade rule-based devolvió null.
//
// Llama al endpoint POST /templates/pick-semantic del API, que embebe el
// body con Gemini RETRIEVAL_QUERY y compara contra embeddings de todos los
// templates (RETRIEVAL_DOCUMENT). Threshold 0.72 — empírico-conservador
// para evitar matches paráfrasis-cercanas pero no relevantes.
//
// Por qué llamar al API en vez de hacer cosine local:
//   1. pgvector con HNSW/ivfflat es más rápido que JS para sets crecientes.
//   2. Bot no necesita knowledge de embeddings, solo el endpoint.
//   3. Re-embed al editar templates ya pasa server-side.
// ─────────────────────────────────────────────────────────────────────

const API_URL = process.env.API_URL || "http://localhost:4010";
const API_TOKEN = process.env.API_TOKEN || "";
const SEMANTIC_TIMEOUT_MS = 5000;
const SEMANTIC_MIN_BODY_LEN = 8;

export type PickMethod = "product" | "tag" | "regex_body" | "learned_reply" | "semantic" | "none";

export type PickedTemplate = {
  template: Template;
  method: PickMethod;
  score?: number;
  /** Si method='learned_reply', el body ya viene con la respuesta lista
   *  (no es un template canónico — viene del histórico de Kathy). */
  learned_reply_id?: number;
  /** Texto del lead original que disparó la respuesta aprendida (audit). */
  learned_query?: string;
};

/**
 * Llama al endpoint de learned_replies — pares (query, response) extraídos
 * del histórico manual de Kathy. Auto-uso solo si has_pii=false; si tiene
 * PII queda como sugerencia para operador, no como template del bot.
 */
async function pickByLearnedReply(body: string, country: string | null = null): Promise<{ id: number; response: string; original_query: string; score: number } | null> {
  if (!body || body.length < SEMANTIC_MIN_BODY_LEN) return null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_TOKEN) headers["Authorization"] = `Bearer ${API_TOKEN}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SEMANTIC_TIMEOUT_MS);
  try {
    const r = await fetch(`${API_URL}/learned-replies/match`, {
      method: "POST",
      headers,
      body: JSON.stringify({ body, country }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const j: any = await r.json();
    if (!j.match) return null;
    return j.match;
  } catch (e: any) {
    clearTimeout(t);
    console.warn(`[template-picker] learned-reply call failed: ${e?.message ?? "unknown"}`);
    return null;
  }
}

async function pickBySemantic(body: string): Promise<{ template: Template; score: number } | null> {
  if (!body || body.length < SEMANTIC_MIN_BODY_LEN) return null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_TOKEN) headers["Authorization"] = `Bearer ${API_TOKEN}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SEMANTIC_TIMEOUT_MS);
  try {
    const r = await fetch(`${API_URL}/templates/pick-semantic`, {
      method: "POST",
      headers,
      body: JSON.stringify({ body }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const j: any = await r.json();
    if (!j.template) return null;
    return { template: j.template as Template, score: j.score };
  } catch (e: any) {
    clearTimeout(t);
    console.warn(`[template-picker] semantic call failed: ${e?.message ?? "unknown"}`);
    return null;
  }
}

/**
 * Variante async — corre cascade rule-based primero, si nada matchea hace
 * fallback a semantic search. Esto es lo que debería usar auto-reply-v2.
 *
 * El método matcheado se devuelve para que el caller pueda loggearlo en
 * interactions.meta y medir cobertura por estrategia.
 */
export async function pickTemplateWithSemantic(input: PickInput, allTemplates: Template[]): Promise<PickedTemplate | null> {
  const tagSet = new Set(input.customTags);

  // PRIORIDAD MAX: tags que ganan ANTES que product. Replicamos el patrón
  // real de Kathy — para inbounds de IA Marketing primero qualifica con la
  // pregunta opener (sales_opener_ia), y el flyer lo manda en el turno
  // siguiente cuando el lead confirma interés. Si dejamos que product gane,
  // el bot saltea la qualificación humana y manda directo el flyer con $150.
  // Migration 045 + sesión 2026-05-07.
  const HIGH_PRIORITY_TAGS: Array<[string, string]> = [
    ["intent:sales_opener_ia", "sales_opener_ia"],
  ];
  for (const [tag, category] of HIGH_PRIORITY_TAGS) {
    if (tagSet.has(tag)) {
      const t = pickByCategory(category, allTemplates);
      if (t) return { template: t, method: "tag" };
    }
  }

  const fromProduct = pickByProduct(input.classifiedProducts, allTemplates);
  if (fromProduct) return { template: fromProduct, method: "product" };

  const tagToCategory: Array<[string, string]> = [
    // Top patterns Kathy (sesión 2026-05-07): específicos primero, antes que
    // los buckets genéricos de pago/info que matchean más amplio y robarían
    // estos hits.
    ["intent:pago_completed", "datos_registro"],
    ["intent:duracion", "info_duracion"],
    ["intent:brochure_pdf", "brochure"],
    ["intent:video", "video"],
    ["intent:pago", "pago"],
    ["intent:pago_metodos", "pago"],
    ["intent:matricula", "inscripcion"],
    ["intent:saludo", "saludo"],
    ["intent:precio", "info_curso"],
    ["intent:horario_fecha", "info_curso"],
    ["intent:info_request", "info_curso"],
  ];
  for (const [tag, category] of tagToCategory) {
    if (tagSet.has(tag)) {
      const t = pickByCategory(category, allTemplates);
      if (t) return { template: t, method: "tag" };
    }
  }

  // PRIORIDAD: learned_replies sobre regex genérico. Una respuesta real
  // de Kathy a "info de consultoria" es siempre mejor que un template
  // estático "info_curso" — usa el tono y los detalles que probaron servir.
  // Solo cae a regex/semantic si learned no devuelve nada con score alto.
  const learned = await pickByLearnedReply(input.body, input.country ?? null);
  if (learned) {
    const synthetic: Template = {
      id: -learned.id,                      // id negativo para que no choque con templates reales en logs
      name: `learned:${learned.id}`,
      body: learned.response,
      category: "learned_reply",
      uses_count: 0,
      image_url: null,
      product_sku: null,
      media_kind: "text",
      sequence_after: null,
      document_url: null,
      document_filename: null,
      document_mime: null,
      video_url: null,
      created_at: "",
      updated_at: "",
    } as Template;
    return {
      template: synthetic,
      method: "learned_reply",
      score: learned.score,
      learned_reply_id: learned.id,
      learned_query: learned.original_query,
    };
  }

  // Si learned no matcheó, regex genérico cubre intents amplios (saludo,
  // info, precio, pago). Es el "safety net" para mensajes muy comunes.
  if (PAYMENT_RE.test(input.body)) {
    const t = pickByCategory("pago", allTemplates);
    if (t) return { template: t, method: "regex_body" };
  }
  if (PRICE_RE.test(input.body) || INFO_RE.test(input.body)) {
    const t = pickByCategory("info_curso", allTemplates);
    if (t) return { template: t, method: "regex_body" };
  }
  if (GREETING_RE.test(input.body)) {
    const t = pickByCategory("saludo", allTemplates);
    if (t) return { template: t, method: "regex_body" };
  }

  // Último recurso: semantic templates (más permisivo, threshold 0.72).
  const sem = await pickBySemantic(input.body);
  if (sem) return { template: sem.template, method: "semantic", score: sem.score };

  return null;
}

export function applyTemplate(template: Template, instance: BotInstance, ctx: { curso?: string }): string {
  let body = template.body;
  body = body.replace(/\{\{\s*curso\s*\}\}/g, ctx.curso ?? "");
  body = body.replace(/\{\{\s*agent_name\s*\}\}/g, instance.agent_name);
  body = body.replace(/\{\{\s*agent_signature\s*\}\}/g, instance.agent_signature ?? "Goberna");
  body = body.replace(/\{\{\s*cuenta_bancaria\s*\}\}/g, instance.cuenta_bancaria ?? "");
  body = body.replace(/\{\{\s*yape\s*\}\}/g, instance.yape_numero ?? "");
  return body;
}

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

export function applyTemplate(template: Template, instance: BotInstance, ctx: { curso?: string }): string {
  let body = template.body;
  body = body.replace(/\{\{\s*curso\s*\}\}/g, ctx.curso ?? "");
  body = body.replace(/\{\{\s*agent_name\s*\}\}/g, instance.agent_name);
  body = body.replace(/\{\{\s*agent_signature\s*\}\}/g, instance.agent_signature ?? "Goberna");
  body = body.replace(/\{\{\s*cuenta_bancaria\s*\}\}/g, instance.cuenta_bancaria ?? "");
  body = body.replace(/\{\{\s*yape\s*\}\}/g, instance.yape_numero ?? "");
  return body;
}

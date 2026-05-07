/**
 * Extractors — funciones puras que parsean texto de outbounds manuales
 * y devuelven valores estructurados (precios, cuentas bancarias, Yape,
 * imágenes, links). Cada función devuelve 0..N matches por mensaje.
 *
 * Diseño:
 *   - Conservadores: prefieren falsos negativos a falsos positivos. Si
 *     una regex devuelve algo que no encaja con la realidad, el operador
 *     ve basura en la cola de candidates.
 *   - Normalización para dedup: "S/. 500", "S/500.00", "500 soles"
 *     → todos colapsan a "500.00 PEN".
 *   - Sin side effects: las funciones solo extraen. El caller es quien
 *     hace upsert en extraction_candidates.
 */

export type ExtractionKind =
  | "price"
  | "bank_account"
  | "yape"
  | "image_url"
  | "whatsapp_link"
  | "product_name";

export type Extracted = {
  kind: ExtractionKind;
  value_raw: string;
  value_normalized: string;
  value_meta?: Record<string, any>;
};

/** Precios — soporta S/, $, soles, dólares, MXN. Asume números peruanos
 *  (comas como miles, punto como decimal). */
const PRICE_RE = /(?:S\/\.?|PEN|\bsoles?\b|\$|USD|d[oó]lares?|MXN|pesos?)\s*([0-9]{1,4}(?:[.,][0-9]{3})*(?:\.[0-9]{1,2})?)\b/gi;
const PRICE_INVERSE_RE = /\b([0-9]{2,5}(?:\.[0-9]{1,2})?)\s*(soles?|d[oó]lares?|pesos?|PEN|USD|MXN)\b/gi;

export function extractPrices(text: string): Extracted[] {
  if (!text) return [];
  const out: Extracted[] = [];
  const seen = new Set<string>();

  const detectCurrency = (raw: string, ctx: string): string => {
    const c = (raw + " " + ctx).toLowerCase();
    if (c.includes("$") || c.includes("usd") || c.includes("dolar") || c.includes("dóla")) return "USD";
    if (c.includes("mxn") || c.includes("peso")) return "MXN";
    return "PEN"; // default — Goberna está en Lima
  };

  for (const m of text.matchAll(PRICE_RE)) {
    const num = parseFloat(m[1].replace(/,/g, ""));
    if (isNaN(num) || num < 10 || num > 50000) continue; // descartá ruido
    const currency = detectCurrency(m[0], text);
    const norm = `${num.toFixed(2)} ${currency}`;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({
      kind: "price",
      value_raw: m[0],
      value_normalized: norm,
      value_meta: { amount: num, currency },
    });
  }
  for (const m of text.matchAll(PRICE_INVERSE_RE)) {
    const num = parseFloat(m[1].replace(/,/g, ""));
    if (isNaN(num) || num < 10 || num > 50000) continue;
    const currency = detectCurrency(m[2], text);
    const norm = `${num.toFixed(2)} ${currency}`;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({
      kind: "price",
      value_raw: m[0],
      value_normalized: norm,
      value_meta: { amount: num, currency },
    });
  }
  return out;
}

/** Cuentas bancarias peruanas. Patrones más comunes:
 *    BCP cuenta:    194-1234567-0-12 (3-7-1-2)
 *    BCP CCI:       002-194-001234567012-34 (3-3-12-2)
 *    Interbank cta: 200-3001234567 (3-10)
 *    Interbank CCI: 003-200-003001234567-89
 *    BBVA cta:      0011-0234-01-0123456789 (4-4-2-10)
 *    BN cta:        04-1234-567890 (2-4-6) */
const BANK_PATTERNS: Array<{ re: RegExp; bank: string; type: "ahorros" | "cci" | "soles" | "dolares" | null }> = [
  { re: /\b(\d{3}-\d{7}-\d-\d{2})\b/g, bank: "BCP", type: "ahorros" },
  { re: /\b(\d{3}-\d{3}-\d{12}-\d{2})\b/g, bank: "BCP", type: "cci" },
  { re: /\b(\d{3}-\d{10})\b/g, bank: "Interbank", type: "ahorros" },
  { re: /\b(\d{3}-\d{3}-\d{12}-\d{2})\b/g, bank: "Interbank", type: "cci" },
  { re: /\b(\d{4}-\d{4}-\d{2}-\d{10})\b/g, bank: "BBVA", type: "ahorros" },
];

export function extractBankAccounts(text: string): Extracted[] {
  if (!text) return [];
  const out: Extracted[] = [];
  const seen = new Set<string>();
  for (const { re, bank, type } of BANK_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const account = m[1];
      // Si el texto cercano menciona otro banco, override.
      const ctx = text.slice(Math.max(0, m.index! - 40), m.index! + 60).toLowerCase();
      let detectedBank = bank;
      if (/\bbbva\b|continental/i.test(ctx)) detectedBank = "BBVA";
      else if (/\binterbank\b|\bibk\b/i.test(ctx)) detectedBank = "Interbank";
      else if (/\bbcp\b|\bcr[eé]dito\b/i.test(ctx)) detectedBank = "BCP";
      else if (/\bbn\b|naci[oó]n/i.test(ctx)) detectedBank = "BN";
      else if (/\bscotia/i.test(ctx)) detectedBank = "Scotiabank";

      const norm = `${detectedBank}:${account.replace(/-/g, "")}`;
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push({
        kind: "bank_account",
        value_raw: m[0],
        value_normalized: norm,
        value_meta: { bank: detectedBank, account, type },
      });
    }
  }
  return out;
}

/** Yape / Plin — números móviles peruanos (9 dígitos empezando en 9).
 *  Solo extrae cuando el texto cercano menciona yape/plin/billetera.
 *  Tolera espacios o guiones entre grupos: "999 888 777", "999-888-777". */
const YAPE_RE = /\b(?:yape|plin|billetera)\s*[:\-]?\s*(?:\+?51[\s-]*)?(9(?:[\s-]?\d){8})\b/gi;

function normalizeYape(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  // Asume últimos 9 dígitos = el número (descarta prefijo 51 si está)
  const last9 = digits.slice(-9);
  if (last9.length === 9 && last9.startsWith("9")) return last9;
  return null;
}

export function extractYape(text: string): Extracted[] {
  if (!text) return [];
  const out: Extracted[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(YAPE_RE)) {
    const num = normalizeYape(m[1]);
    if (!num || seen.has(num)) continue;
    seen.add(num);
    out.push({
      kind: "yape",
      value_raw: m[0].trim(),
      value_normalized: num,
      value_meta: { phone: `+51${num}` },
    });
  }
  return out;
}

/** wa.me links y enlaces de WhatsApp Group/Channel */
const WALINK_RE = /\b(https?:\/\/(?:wa\.me|chat\.whatsapp\.com|whatsapp\.com\/channel)\/[A-Za-z0-9_\-?=&%./]+)/gi;

export function extractWhatsappLinks(text: string): Extracted[] {
  if (!text) return [];
  const out: Extracted[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(WALINK_RE)) {
    const url = m[1].replace(/[.,;)]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      kind: "whatsapp_link",
      value_raw: m[1],
      value_normalized: url,
    });
  }
  return out;
}

/** Image URLs en el body (aunque normalmente las imágenes vienen via
 *  meta.media_url, no inline en el body — esta función es para enlaces
 *  inline tipo Drive/imgur que el operador comparte como texto). */
const IMG_URL_RE = /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|webp|gif)\b/gi;

export function extractImageUrls(text: string): Extracted[] {
  if (!text) return [];
  const out: Extracted[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(IMG_URL_RE)) {
    const url = m[0].replace(/[.,;)]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      kind: "image_url",
      value_raw: m[0],
      value_normalized: url,
    });
  }
  return out;
}

/** Nombres de productos — heurística: líneas en MAYÚSCULAS de 3+ palabras
 *  que contengan keywords típicos del catálogo (DIPLOMA, CURSO, TALLER,
 *  CERTIFICACIÓN, MASTER, ESPECIALIZACIÓN). */
const PRODUCT_NAME_RE = /\b(?:DIPLOMA|CURSO|TALLER|CERTIFICACI[OÓ]N|MASTER|ESPECIALIZACI[OÓ]N|PROGRAMA)\s+[A-ZÁÉÍÓÚÑ\s]{8,80}/g;

export function extractProductNames(text: string): Extracted[] {
  if (!text) return [];
  const out: Extracted[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(PRODUCT_NAME_RE)) {
    const name = m[0].trim().replace(/\s+/g, " ").slice(0, 100);
    const norm = name.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({
      kind: "product_name",
      value_raw: name,
      value_normalized: norm,
    });
  }
  return out;
}

/** All-in-one: corre todos los extractores y devuelve la unión. */
export function extractAll(text: string): Extracted[] {
  return [
    ...extractPrices(text),
    ...extractBankAccounts(text),
    ...extractYape(text),
    ...extractWhatsappLinks(text),
    ...extractImageUrls(text),
    ...extractProductNames(text),
  ];
}

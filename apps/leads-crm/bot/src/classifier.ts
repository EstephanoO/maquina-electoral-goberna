/** Message classifier — detects product interest + intent signals */

interface ClassifyResult {
  products: string[];
  isGreeting: boolean;
  isInfoRequest: boolean;
}

interface ProductRule {
  product: string;
  keywords: RegExp[];
  course: string;
}

const PRODUCT_RULES: ProductRule[] = [
  { product: "Oratoria", keywords: [/\boratoria\b/, /poder de la oratoria/, /libro.*oratoria/, /curso.*oratoria/], course: "Oratoria" },
  { product: "Consultor Político", keywords: [/consultor\s*pol[ií]tic/, /diploma\s*(internacional|consultor)/, /consultor[ií]a\s*pol[ií]tic/], course: "Consultor Político" },
  { product: "Inteligencia Emocional", keywords: [/inteligencia\s*emocional/], course: "Inteligencia Emocional" },
  { product: "Marketing Político", keywords: [/marketing\s*pol[ií]tic/, /marketing\s*electoral/, /campa[ñn]a\s*(electoral|pol[ií]tic)/], course: "Marketing" },
  { product: "Liderazgo", keywords: [/curso.*liderazgo/, /liderazgo.*curso/, /liderazgo\s*pol[ií]tic/], course: "Liderazgo" },
  { product: "Comunicación Política", keywords: [/comunicaci[oó]n\s*pol[ií]tic/, /comunicaci[oó]n\s*estrat[eé]gic/], course: "Comunicación" },
  { product: "Gobernabilidad", keywords: [/gobernabilidad/, /gesti[oó]n\s*p[uú]blica/], course: "Gobernabilidad" },
  // Cursos detectados en pautas reales (auditoría 2026-05-06):
  { product: "Gestión Parlamentaria", keywords: [/gesti[oó]n\s*parlamentari/, /parlamentari[ao]\s*bicameral/, /diploma.*parlamentari/, /t[eé]cnico\s*de\s*gesti[oó]n\s*parlamentari/], course: "Gestión Parlamentaria" },
  { product: "Análisis de Inteligencia", keywords: [/an[aá]lisis\s*de\s*(la\s*)?inteligencia/, /inteligencia\s*estrat[eé]gic/, /analista\s*de\s*inteligencia/], course: "Análisis de Inteligencia" },
  { product: "Campañas de Contraste", keywords: [/campa[ñn]as?\s*de\s*contraste/, /\bcontraste\s*pol[ií]tic/, /guerra\s*sucia/], course: "Campañas de Contraste" },
  { product: "Geopolítica", keywords: [/\bgeopol[ií]tic/, /geoestrateg/], course: "Geopolítica" },
  { product: "Negociación Política", keywords: [/negociaci[oó]n\s*pol[ií]tic/, /negociaci[oó]n\s*estrat[eé]gic/, /resoluci[oó]n\s*de\s*conflictos/], course: "Negociación Política" },
];

const INTENT_RE = /\b(interesa|quiero|deseo|quisiera|necesito|informaci[oó]n|informacion|info\b|detalles|precio|costo|cu[aá]nto\s*cuesta|inscri[bp]|obtener|adquirir|comprar|libro\b|curso\b|diploma\b)\b/i;
const AUTO_INQUIRY_RE = /^(hola[,!.]?\s*)?(me\s+interesa|quiero\s+(m[aá]s\s+)?detalles|quiero\s+informaci[oó]n)/i;
const MIN_LENGTH = 12;

export function classifyMessage(body: string): ClassifyResult {
  if (!body || body.length < MIN_LENGTH) {
    return { products: [], isGreeting: false, isInfoRequest: false };
  }
  const lower = body.toLowerCase();
  const hasIntent = INTENT_RE.test(lower) || AUTO_INQUIRY_RE.test(body);
  if (!hasIntent) return { products: [], isGreeting: false, isInfoRequest: false };

  const products: string[] = [];
  for (const rule of PRODUCT_RULES) {
    if (rule.keywords.some((re) => re.test(lower))) products.push(rule.product);
  }

  return {
    products,
    isGreeting: /^(hola|buenos?\s*(d[ií]as|tardes|noches)|saludos|buenas)\b/i.test(body),
    isInfoRequest: hasIntent,
  };
}

export function getCourse(product: string): string | null {
  return PRODUCT_RULES.find((r) => r.product === product)?.course ?? null;
}

const PREFIXES = [
  // Mobile prefixes que requieren match LARGO antes que el prefix corto:
  { p: "1809", c: "República Dominicana" }, { p: "1829", c: "República Dominicana" }, { p: "1849", c: "República Dominicana" },
  { p: "1787", c: "Puerto Rico" }, { p: "1939", c: "Puerto Rico" },
  { p: "521",  c: "México" },        // móvil — DEBE ir antes de "52"
  { p: "549",  c: "Argentina" },     // móvil — DEBE ir antes de "54"
  // Países LATAM con código de 3 dígitos:
  { p: "593", c: "Ecuador" }, { p: "591", c: "Bolivia" }, { p: "595", c: "Paraguay" },
  { p: "598", c: "Uruguay" }, { p: "506", c: "Costa Rica" }, { p: "502", c: "Guatemala" },
  { p: "503", c: "El Salvador" }, { p: "504", c: "Honduras" }, { p: "505", c: "Nicaragua" },
  { p: "507", c: "Panamá" },
  // 2 dígitos:
  { p: "51", c: "Perú" }, { p: "52", c: "México" }, { p: "57", c: "Colombia" },
  { p: "56", c: "Chile" }, { p: "54", c: "Argentina" }, { p: "58", c: "Venezuela" },
  { p: "55", c: "Brasil" }, { p: "53", c: "Cuba" },
  // Europa:
  { p: "34", c: "España" }, { p: "33", c: "Francia" }, { p: "49", c: "Alemania" }, { p: "39", c: "Italia" }, { p: "44", c: "Reino Unido" },
  // Catch-all:
  { p: "1", c: "EEUU/Canadá" },
];

export function detectCountry(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  for (const { p, c } of PREFIXES) {
    if (digits.startsWith(p)) return c;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Custom rules dinámicas: el bot pulla /ai/rules de leads-crm-api con
// cache de 60s. Permite que admin/operador agreguen patterns en la UI
// y se apliquen sin redeploy.
//
// Schema esperado (de migration 012_ai_training.sql):
//   { id, name, pattern, tag, weight, enabled }
// ─────────────────────────────────────────────────────────────────────

interface CustomRule {
  id: number;
  name: string;
  pattern: string;
  tag: string;
  weight: number;
  enabled: boolean;
  // Cache del RegExp compilado (lazy build para evitar re-compilar en cada call).
  _re?: RegExp | null;
}

let customRulesCache: CustomRule[] = [];
let customRulesLastFetch = 0;
const CUSTOM_RULES_TTL_MS = 60_000;

const API_URL = process.env.API_URL || "http://localhost:4010";
const API_TOKEN = process.env.API_TOKEN || "";

async function fetchCustomRules(): Promise<CustomRule[]> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_TOKEN) headers["Authorization"] = `Bearer ${API_TOKEN}`;
  const res = await fetch(`${API_URL}/ai/rules`, { headers });
  if (!res.ok) throw new Error(`fetch /ai/rules ${res.status}`);
  const rows = await res.json() as CustomRule[];
  // Pre-compila los regex para que el match sea barato. Si una rule tiene
  // pattern roto, _re queda null y se ignora en aplicación (no rompe el bot).
  return rows.filter((r) => r.enabled).map((r) => {
    let re: RegExp | null = null;
    try { re = new RegExp(r.pattern, "i"); } catch { re = null; }
    return { ...r, _re: re };
  });
}

export async function getCustomRules(force = false): Promise<CustomRule[]> {
  if (!force && Date.now() - customRulesLastFetch < CUSTOM_RULES_TTL_MS) {
    return customRulesCache;
  }
  try {
    customRulesCache = await fetchCustomRules();
    customRulesLastFetch = Date.now();
  } catch (e: any) {
    // Si la API se cae, mantenemos el cache último (fail-soft).
    console.warn("[classifier] fetch custom rules failed:", e.message);
  }
  return customRulesCache;
}

/**
 * Aplica las custom rules a un body de mensaje. Devuelve los tags únicos
 * que matchearon. Llamarlo después de classifyMessage para enriquecer.
 *
 * Idempotente: re-corridas sobre el mismo texto devuelven los mismos tags.
 */
export async function applyCustomRules(body: string): Promise<string[]> {
  if (!body || body.length < 1) return [];
  const rules = await getCustomRules();
  const tags = new Set<string>();
  for (const r of rules) {
    if (!r._re) continue;
    if (r._re.test(body)) tags.add(r.tag);
  }
  return Array.from(tags);
}

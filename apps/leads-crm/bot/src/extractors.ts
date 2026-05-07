/**
 * Message extractors: parsea mensajes entrantes y saca datos estructurados
 * que valen la pena guardar en el lead. NER ligero + regex robustos.
 *
 * Lo que detectamos:
 *   - email          → lead.email
 *   - DNI peruano    → lead.dni
 *   - ciudad/país    → lead.country / opcional ciudad
 *   - fecha de nacimiento (varios formatos)
 *   - ocupación      → lead.ocupacion
 *   - intent strength (confidence 0-1) — qué tan listo está para comprar
 *   - sales-ready signal — bool si pide pago + tiene interés previo
 *   - frustración    → "no me llega", "estoy esperando", "molesto"
 */

export type ExtractedData = {
  email?: string;
  dni?: string;
  country?: string;
  ciudad?: string;
  fecha_nacimiento?: string;       // ISO date if parseable
  ocupacion?: string;
  intent_strength?: number;        // 0-1
  sales_ready?: boolean;
  frustration?: boolean;
  payment_proof?: boolean;         // adjuntó comprobante / mencionó pago hecho
};

// ── Patterns ─────────────────────────────────────────────────────

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i;

const DNI_RE = /\b(?:dni|cedula|c[ée]dula)[:\s]*?(\d{7,10})\b|\b(\d{8})\b/i;

const CIUDAD_PERU_RE = /\b(lima|arequipa|cusco|trujillo|piura|chiclayo|iquitos|huancayo|ayacucho|tacna|puno|tumbes|pucallpa|cajamarca|chimbote|huaraz)\b/i;
const CIUDAD_ECUADOR_RE = /\b(quito|guayaquil|cuenca|machala|loja|riobamba|ambato|esmeraldas)\b/i;
const CIUDAD_MEX_RE = /\b(cdmx|ciudad\s*de\s*m[eé]xico|guadalajara|monterrey|puebla|tijuana|queretaro|m[eé]rida|oaxaca|cancun)\b/i;
const CIUDAD_COL_RE = /\b(bogot[aá]|medell[ií]n|cali|cartagena|barranquilla|bucaramanga)\b/i;

const FECHA_RE = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/;

const OCUPACIONES = [
  "abogad", "ingenier", "m[eé]dic", "doctor", "doctora", "consult",
  "estudiant", "profesor", "docent", "polic[ií]a", "militar",
  "psicolog", "soci[oó]log", "polit[oó]log", "periodist", "comunica",
  "alcalde", "regidor", "concejal", "diputad", "senador", "ministr",
  "asesor", "arquitec", "contad", "administr",
];

// Sales-ready signals
const PAYMENT_REQUEST_RE = /\b(c[oó]mo\s*(pago|puedo\s*pagar)|medios\s*de\s*pago|n[uú]mero\s*de\s*cuenta|yape|deposito|transferencia)\b/i;
const PAYMENT_DONE_RE = /\b(ya\s*(hice|realice|pagu[eé])|deposit[eé]|transferí|adjunto.*comprobante|pagu[eé]\s*el|listo\s*el\s*pago|comprobante\s*adjunto)\b/i;
const HIGH_INTENT_RE = /\b(quiero\s*inscrib|me\s*inscrib|c[oó]mo\s*me\s*inscribo|necesito\s*el\s*link|d[oó]nde\s*pago|sigue\s*disponible|todav[ií]a\s*est[aá]|mandame\s*el\s*link|env[ií]ame\s*el\s*link)/i;

// Frustration signals (sin trailing \b para que matchee "molesto", "enojada", etc.)
const FRUSTRATION_RE = /\b(molest|enoj|muy\s*mal|p[eé]simo|desde\s*hace|no\s*me\s*llega|no\s*recibi|todav[ií]a\s*sin|no\s*me\s*responden|por\s*qu[eé]\s*tardan|insufrible|fastidi)/i;

// ── Extractors ───────────────────────────────────────────────────

export function extractFromMessage(body: string): ExtractedData {
  if (!body || body.length < 2) return {};
  const out: ExtractedData = {};

  // Email
  const emailM = body.match(EMAIL_RE);
  if (emailM) out.email = emailM[0].toLowerCase();

  // DNI (8 dígitos peruanos típicos, o tras "DNI:")
  const dniM = body.match(DNI_RE);
  if (dniM) out.dni = (dniM[1] || dniM[2])?.trim();

  // Ciudad / país
  if (CIUDAD_PERU_RE.test(body))    { out.country = "Perú";    out.ciudad = body.match(CIUDAD_PERU_RE)![1]; }
  if (CIUDAD_ECUADOR_RE.test(body)) { out.country = "Ecuador"; out.ciudad = body.match(CIUDAD_ECUADOR_RE)![1]; }
  if (CIUDAD_MEX_RE.test(body))     { out.country = "México";  out.ciudad = body.match(CIUDAD_MEX_RE)![1]; }
  if (CIUDAD_COL_RE.test(body))     { out.country = "Colombia"; out.ciudad = body.match(CIUDAD_COL_RE)![1]; }

  // Fecha
  const fM = body.match(FECHA_RE);
  if (fM) {
    const [, dd, mm, yy] = fM;
    const yyyy = yy.length === 2 ? `19${yy}` : yy;  // "60" → "1960", asumimos siempre <2000
    if (Number(dd) <= 31 && Number(mm) <= 12 && Number(yyyy) >= 1900 && Number(yyyy) <= 2010) {
      out.fecha_nacimiento = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
  }

  // Ocupación
  for (const occ of OCUPACIONES) {
    const re = new RegExp(`\\b(${occ}\\w*)\\b`, "i");
    const m = body.match(re);
    if (m) { out.ocupacion = m[1].toLowerCase(); break; }
  }

  // Sales signals
  const wantsPayment = PAYMENT_REQUEST_RE.test(body);
  const paymentDone  = PAYMENT_DONE_RE.test(body);
  const highIntent   = HIGH_INTENT_RE.test(body);

  if (paymentDone) out.payment_proof = true;
  if (wantsPayment || highIntent || paymentDone) out.sales_ready = true;

  // Intent strength score
  let strength = 0;
  if (highIntent)   strength = Math.max(strength, 0.85);
  if (wantsPayment) strength = Math.max(strength, 0.75);
  if (paymentDone)  strength = 1.0;
  if (strength > 0) out.intent_strength = strength;

  // Frustration
  if (FRUSTRATION_RE.test(body)) out.frustration = true;

  return out;
}

/** Build patch for crmApi.updateLead based on extracted fields, no overwrite. */
export function buildLeadPatch(
  existing: { email?: string | null; dni?: string | null; country?: string | null; ocupacion?: string | null; fecha_nacimiento?: string | null },
  extracted: ExtractedData,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (extracted.email && !existing.email)
    patch.email = extracted.email;
  if (extracted.dni && !existing.dni)
    patch.dni = extracted.dni;
  if (extracted.country && (!existing.country || existing.country === "Unknown"))
    patch.country = extracted.country;
  if (extracted.ocupacion && !existing.ocupacion)
    patch.ocupacion = extracted.ocupacion;
  if (extracted.fecha_nacimiento && !existing.fecha_nacimiento)
    patch.fecha_nacimiento = extracted.fecha_nacimiento;

  return patch;
}

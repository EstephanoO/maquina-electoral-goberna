/**
 * pushname-analyzer — extrae info estructurada del `pushName` de WhatsApp.
 *
 * El pushName es el nombre de display que el contacto eligió en su perfil.
 * En la práctica los users lo usan para muchas cosas — no siempre es un
 * nombre real. Patrones observados en datos reales (audit 2026-05-06):
 *
 *   "Jenny Choqueticlla"             → nombre + apellido
 *   "Adriana"                        → nombre solo
 *   "ANJHELA GUISSEL"                → nombre en CAPS
 *   "Maria (Ecuador)"                → nombre + país suffix
 *   "Manuel Zapata (US)"             → nombre + país abreviado
 *   "(Perú)"                         → solo país, NO es nombre
 *   "Sin nombre"                     → declarativo de privacidad
 *   "Aidé GOBERNA MÉXICO"            → nombre + empresa/organización
 *   "Cambia tu manera de pensar..."  → frase / motto, NO es nombre
 *   "Dr. Juan", "Ing. María"         → título profesional + nombre
 *   "🌟 Maria 🌟"                    → emojis decorativos
 *   ""                               → vacío
 *
 * Esta función separa `clean_name` (best guess del nombre real, capitalizado)
 * de `tags` (info inferida: país, profesión, etc.) y `discard` (true cuando
 * el pushName es completamente inutilizable como nombre).
 */

export type PushNameInfo = {
  /** Nombre limpio listo para guardar en lead.name. "" si discard=true. */
  clean_name: string;
  /** País detectado en el pushName (suffix "(Perú)", abrev "(US)", etc.). */
  country: string | null;
  /** Tags inferidas del pushName. Ej: "profesion:doctor", "tipo:negocio". */
  tags: string[];
  /** Si true, el pushName no aporta nada (es vacío/junk/motto/solo país). */
  discard: boolean;
  /** Razón del discard, para auditoría. */
  discard_reason?: string;
};

// ── Detección de país por suffix en pushName ─────────────────────────
//
// Importante: `\b` en JS regex NO funciona con letras acentuadas (ú, é, etc)
// porque `\w` es ASCII-only por default. `\bper[uú]\b` falla en "Perú".
// Usamos lookbehind/lookahead negativos contra el alfabeto español para
// emular boundaries que respeten acentos.
const LB = "(?<![a-záéíóúñü])"; // left boundary
const RB = "(?![a-záéíóúñü])";  // right boundary
const wb = (body: string): RegExp => new RegExp(`${LB}(?:${body})${RB}`, "i");

const COUNTRY_PATTERNS: ReadonlyArray<{ pattern: RegExp; country: string }> = [
  { pattern: wb("per[uú]|peru"), country: "Perú" },
  { pattern: wb("m[eé]xico|mexico|mx"), country: "México" },
  { pattern: wb("ecuador|ec"), country: "Ecuador" },
  { pattern: wb("bolivia|bo"), country: "Bolivia" },
  { pattern: wb("colombia|co"), country: "Colombia" },
  { pattern: wb("chile|cl"), country: "Chile" },
  { pattern: wb("argentina|ar"), country: "Argentina" },
  { pattern: wb("venezuela|ve"), country: "Venezuela" },
  { pattern: wb("costa\\s*rica|cr"), country: "Costa Rica" },
  { pattern: wb("guatemala|gt"), country: "Guatemala" },
  { pattern: wb("el\\s*salvador|sv"), country: "El Salvador" },
  { pattern: wb("honduras|hn"), country: "Honduras" },
  { pattern: wb("nicaragua|ni"), country: "Nicaragua" },
  { pattern: wb("panam[aá]|pa"), country: "Panamá" },
  // RD: el "dr" abreviado lo dejamos pero solo cuando viene como token
  // standalone — sin "dr" para evitar match con "Dr." (título médico).
  { pattern: wb("rep(?:[uú]blica)?\\.?\\s*dominicana|rd"), country: "República Dominicana" },
  { pattern: wb("paraguay|py"), country: "Paraguay" },
  { pattern: wb("uruguay|uy"), country: "Uruguay" },
  { pattern: wb("cuba|cu"), country: "Cuba" },
  { pattern: wb("espa[nñ]a|spain"), country: "España" },
  { pattern: wb("eeuu|ee\\.?\\s*uu|estados\\s*unidos|usa|us"), country: "Estados Unidos" },
];

/** Detecta país desde un texto (no necesariamente solo del paréntesis). */
function detectCountryInText(text: string): string | null {
  for (const { pattern, country } of COUNTRY_PATTERNS) {
    if (pattern.test(text)) return country;
  }
  return null;
}

// ── Profesiones / títulos ────────────────────────────────────────────
const PROFESSION_PATTERNS: ReadonlyArray<{ pattern: RegExp; tag: string; strip: RegExp }> = [
  { pattern: /\b(?:dr|dra|doctor|doctora)\.?\s+/i, tag: "profesion:doctor",      strip: /\b(?:dr|dra|doctor|doctora)\.?\s+/i },
  { pattern: /\b(?:ing|ingeniero|ingeniera)\.?\s+/i, tag: "profesion:ingeniero", strip: /\b(?:ing|ingeniero|ingeniera)\.?\s+/i },
  { pattern: /\b(?:lic|licenciado|licenciada)\.?\s+/i, tag: "profesion:licenciado", strip: /\b(?:lic|licenciado|licenciada)\.?\s+/i },
  { pattern: /\b(?:profe?|profesor|profesora|prof)\.?\s+/i, tag: "profesion:docente", strip: /\b(?:profe?|profesor|profesora|prof)\.?\s+/i },
  { pattern: /\b(?:abg|abogad[oa])\.?\s+/i, tag: "profesion:abogado", strip: /\b(?:abg|abogad[oa])\.?\s+/i },
  { pattern: /\b(?:cdor|contador[a]?)\.?\s+/i, tag: "profesion:contador", strip: /\b(?:cdor|contador[a]?)\.?\s+/i },
  { pattern: /\b(?:arq|arquitect[oa])\.?\s+/i, tag: "profesion:arquitecto", strip: /\b(?:arq|arquitect[oa])\.?\s+/i },
];

// ── Markers de empresa/organización en CAPS ──────────────────────────
const ORG_MARKERS = /\b(?:empresa|tienda|servicios?|restaurante|cafe|cafeter[ií]a|consultor[ií]a|consultorio|negocio|distribuidor[a]?|comercial|sac|s\.?a\.?c\.?|s\.?a\.?|srl|s\.?r\.?l\.?|inc|ltd|llc)\b/i;

// ── Junk explícito ───────────────────────────────────────────────────
const EXPLICIT_JUNK_RE = /^(sin\s*nombre|no\s*disponible|n\/a|nn|anonim[oa]|privado|reservado)$/i;

/**
 * Limpia y analiza el pushName. Devuelve clean_name + tags + país inferido.
 */
export function analyzePushName(rawPushName: string | undefined | null, phone?: string): PushNameInfo {
  const tags: string[] = [];
  let country: string | null = null;

  // 1. Trim + colapsa whitespace.
  const initial = (rawPushName ?? "").replace(/\s+/g, " ").trim();
  if (!initial) {
    return { clean_name: "", country: null, tags: [], discard: true, discard_reason: "empty" };
  }

  // 2. Junk explícito.
  if (EXPLICIT_JUNK_RE.test(initial)) {
    return { clean_name: "", country: null, tags: [], discard: true, discard_reason: "explicit_junk" };
  }

  // 3. Solo dígitos / +dígitos = otro número, no nombre.
  if (/^\+?[\d\s().-]+$/.test(initial)) {
    return { clean_name: "", country: null, tags: [], discard: true, discard_reason: "looks_like_phone" };
  }

  // 4. Mismo phone (con o sin +): descarta.
  if (phone) {
    const dn = initial.replace(/\D/g, "");
    const dp = phone.replace(/\D/g, "");
    if (dn === dp) {
      return { clean_name: "", country: null, tags: [], discard: true, discard_reason: "matches_phone" };
    }
  }

  // 5. Solo país entre paréntesis: "(Perú)", "(México)" — no es nombre.
  const onlyCountryMatch = initial.match(/^\(([^)]+)\)$/);
  if (onlyCountryMatch) {
    const inside = onlyCountryMatch[1]!.trim();
    country = detectCountryInText(inside);
    return {
      clean_name: "",
      country,
      tags: country ? [`país:${slug(country)}`] : [],
      discard: true,
      discard_reason: "only_country_parens",
    };
  }

  // 6. Working copy. A medida que extraemos info la vamos limpiando.
  let working = initial;

  // 6a. País entre paréntesis al final: "Maria (Ecuador)" → name="Maria", country="Ecuador"
  const trailingCountryMatch = working.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (trailingCountryMatch) {
    const inside = trailingCountryMatch[2]!.trim();
    const detected = detectCountryInText(inside);
    if (detected) {
      country = detected;
      tags.push(`país:${slug(detected)}`);
      working = trailingCountryMatch[1]!.trim();
    }
  }

  // 6b. País sin paréntesis ya en el texto: "Aidé GOBERNA MÉXICO"
  if (!country) {
    const detected = detectCountryInText(working);
    if (detected) {
      country = detected;
      tags.push(`país:${slug(detected)}`);
      // No removemos — puede ser parte del nombre/empresa.
    }
  }

  // 7. Profesión / título al inicio: "Dr. Juan" → tag + strip.
  for (const { pattern, tag, strip } of PROFESSION_PATTERNS) {
    if (pattern.test(working)) {
      tags.push(tag);
      working = working.replace(strip, "").trim();
      break; // un título a la vez.
    }
  }

  // 8. Detectar empresa/organización.
  if (ORG_MARKERS.test(working)) {
    tags.push("tipo:negocio");
  }

  // 9. Strip emojis + símbolos al inicio/fin (decoración).
  working = working
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N})]+$/u, "")
    .trim();

  // 10. Frases largas (> 5 palabras o > 40 chars sin espacios típicos de nombre):
  //     son mottoes / slogans. Descarta como name pero conserva tags.
  const wordCount = working.split(/\s+/).filter(Boolean).length;
  if (working.length > 60 || wordCount > 5) {
    return {
      clean_name: "",
      country,
      tags,
      discard: true,
      discard_reason: "long_phrase",
    };
  }

  // 11. Demasiado corto (< 2 chars) o ya quedó vacío.
  if (working.length < 2) {
    return {
      clean_name: "",
      country,
      tags,
      discard: true,
      discard_reason: "too_short_after_clean",
    };
  }

  // 12. Title-case si está todo en CAPS (≥80% letras mayúsculas).
  const letters = working.replace(/[^a-záéíóúñü]/gi, "");
  if (letters.length > 0 && letters === letters.toUpperCase()) {
    working = toTitleCase(working);
  }

  return {
    clean_name: working.slice(0, 80),
    country,
    tags,
    discard: false,
  };
}

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s|-|')([\p{L}])/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Slug seguro: lower → strip combining diacritics (NFD U+0300-U+036F) →
 * non-alphanumeric a "-". El range explícito ̀-ͯ es robusto contra
 * problemas de codificación al transferir el archivo entre máquinas.
 */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Country detection desde phone prefix ──────────────────────────────
//
// Portado del classifier del bot Baileys. Útil cuando el pushName no trae
// país pero el number sí (ej. lead +593... → Ecuador).

const PHONE_COUNTRY_PREFIXES: ReadonlyArray<{ prefix: string; country: string }> = [
  // Caribe (overlap con +1, deben ir antes)
  { prefix: "1809", country: "República Dominicana" },
  { prefix: "1829", country: "República Dominicana" },
  { prefix: "1849", country: "República Dominicana" },
  // 3-digit prefixes
  { prefix: "593", country: "Ecuador" },
  { prefix: "591", country: "Bolivia" },
  { prefix: "595", country: "Paraguay" },
  { prefix: "598", country: "Uruguay" },
  { prefix: "506", country: "Costa Rica" },
  { prefix: "502", country: "Guatemala" },
  { prefix: "503", country: "El Salvador" },
  { prefix: "504", country: "Honduras" },
  { prefix: "505", country: "Nicaragua" },
  { prefix: "507", country: "Panamá" },
  // 2-digit prefixes
  { prefix: "51", country: "Perú" },
  { prefix: "52", country: "México" },
  { prefix: "57", country: "Colombia" },
  { prefix: "56", country: "Chile" },
  { prefix: "54", country: "Argentina" },
  { prefix: "58", country: "Venezuela" },
  { prefix: "55", country: "Brasil" },
  { prefix: "53", country: "Cuba" },
  { prefix: "34", country: "España" },
  // 1-digit (USA/Canadá overlap, va último)
  { prefix: "1", country: "EEUU/Canadá" },
];

export function detectCountryFromPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  for (const { prefix, country } of PHONE_COUNTRY_PREFIXES) {
    if (digits.startsWith(prefix)) return country;
  }
  return null;
}

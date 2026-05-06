/**
 * Derive country from a contact name that carries a trailing parenthetical tag.
 * Example: "Juan Perez (bolivia)" -> { name: "Juan Perez", country: "Bolivia" }
 * If no known country is detected, the name is returned untouched and country is null.
 */

// map of normalized token -> canonical display name
const TABLE: Record<string, string> = {
  "bolivia": "Bolivia",
  "peru": "Perú",
  "chile": "Chile",
  "argentina": "Argentina", "argento": "Argentina",
  "colombia": "Colombia",
  "ecuador": "Ecuador",
  "mexico": "México",
  "venezuela": "Venezuela",
  "uruguay": "Uruguay",
  "paraguay": "Paraguay",
  "brasil": "Brasil", "brazil": "Brasil",
  "usa": "Estados Unidos", "eeuu": "Estados Unidos", "ee uu": "Estados Unidos",
  "estados unidos": "Estados Unidos",
  "espana": "España", "spain": "España",
  "puerto rico": "Puerto Rico",
  "costa rica": "Costa Rica",
  "panama": "Panamá",
  "republica dominicana": "República Dominicana",
  "rep dominicana": "República Dominicana",
  "dominicana": "República Dominicana",
  "guatemala": "Guatemala",
  "honduras": "Honduras",
  "nicaragua": "Nicaragua",
  "el salvador": "El Salvador", "salvador": "El Salvador",
  "cuba": "Cuba",
  "canada": "Canadá",
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type CountryPrefix = { code: string; country: string };

// Default phone prefixes seeded on first boot. Editable from the web CRM.
export const DEFAULT_COUNTRY_PREFIXES: CountryPrefix[] = [
  { code: "+51", country: "Perú" },
  { code: "+52", country: "México" },
  { code: "+591", country: "Bolivia" },
  { code: "+593", country: "Ecuador" },
  { code: "+57", country: "Colombia" },
  { code: "+56", country: "Chile" },
  { code: "+54", country: "Argentina" },
  { code: "+58", country: "Venezuela" },
  { code: "+598", country: "Uruguay" },
  { code: "+595", country: "Paraguay" },
  { code: "+55", country: "Brasil" },
  { code: "+34", country: "España" },
  { code: "+1", country: "Estados Unidos" },
  { code: "+506", country: "Costa Rica" },
  { code: "+507", country: "Panamá" },
  { code: "+502", country: "Guatemala" },
  { code: "+503", country: "El Salvador" },
  { code: "+504", country: "Honduras" },
  { code: "+505", country: "Nicaragua" },
  { code: "+53", country: "Cuba" },
  { code: "+1809", country: "República Dominicana" },
  { code: "+1829", country: "República Dominicana" },
  { code: "+1849", country: "República Dominicana" },
  { code: "+1787", country: "Puerto Rico" },
];

/**
 * Match a phone number against the longest matching country prefix.
 * phone can be "+51986...", "51986..." or with spaces/dashes; we normalize.
 */
export function detectCountryFromPhone(phone: string | null | undefined, prefixes: CountryPrefix[]): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  const normalized = "+" + digits;
  // Sort by code length descending so longer (more specific) prefixes win
  const sorted = [...prefixes].sort((a, b) => b.code.length - a.code.length);
  const match = sorted.find((p) => normalized.startsWith(p.code));
  return match?.country ?? null;
}

export function deriveCountry(name: string | null | undefined): { name: string; country: string | null } {
  if (!name) return { name: name ?? "", country: null };
  const m = name.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (!m) return { name: name.trim(), country: null };
  const base = m[1].trim();
  const tag = normalize(m[2]);
  const country = TABLE[tag] ?? null;
  if (!country) return { name: name.trim(), country: null }; // unknown tag — keep as-is
  return { name: base, country };
}

/**
 * Substitución de variables en mensajes de campaña.
 * Soporta:
 *   {{nombre}}            → primer nombre del lead (o phone si no tiene)
 *   {{nombre_completo}}   → name completo
 *   {{ciudad}} / {{país}} → country (ciudad no se distingue por ahora)
 *   {{último_curso}}      → last_course
 *   {{n_compras}}         → n_purchases
 *   {{tier}}              → buyer_tier traducido (VIP, recurrente…)
 */

export type LeadCtx = {
  name: string | null;
  phone: string | null;
  country: string | null;
  last_course: string | null;
  n_purchases: number | null;
  buyer_tier: string | null;
};

const TIER_LABEL: Record<string, string> = {
  vip:      "cliente VIP",
  repeat:   "cliente recurrente",
  single:   "cliente",
  prospect: "prospect",
};

export function firstName(name: string | null | undefined): string {
  if (!name) return "";
  if (/^\+?\d/.test(name)) return "";
  return name.split(/\s+/)[0];
}

export function personalize(template: string, lead: LeadCtx): string {
  if (!template) return "";

  const fname = firstName(lead.name) || "amigo";
  const fullName = lead.name && !/^\+?\d/.test(lead.name) ? lead.name : "";

  const subs: Record<string, string> = {
    "{{nombre}}":          fname,
    "{{nombre_completo}}": fullName || fname,
    "{{ciudad}}":          lead.country ?? "",
    "{{país}}":            lead.country ?? "",
    "{{pais}}":            lead.country ?? "",
    "{{último_curso}}":    lead.last_course ?? "",
    "{{ultimo_curso}}":    lead.last_course ?? "",
    "{{n_compras}}":       String(lead.n_purchases ?? 0),
    "{{tier}}":            TIER_LABEL[lead.buyer_tier ?? ""] ?? "",
  };

  let out = template;
  for (const [k, v] of Object.entries(subs)) {
    out = out.split(k).join(v);
  }
  return out;
}

export const AVAILABLE_VARS = [
  { token: "{{nombre}}",          desc: "Primer nombre", sample: "Carlos" },
  { token: "{{nombre_completo}}", desc: "Nombre completo", sample: "Carlos Carranza" },
  { token: "{{ciudad}}",          desc: "País del lead", sample: "México" },
  { token: "{{país}}",            desc: "Alias de ciudad", sample: "México" },
  { token: "{{último_curso}}",    desc: "Último curso comprado", sample: "Diploma de IA" },
  { token: "{{n_compras}}",       desc: "Cantidad de compras", sample: "3" },
  { token: "{{tier}}",            desc: "Tier traducido", sample: "cliente VIP" },
];

/** Estima cuándo terminará la campaña con throttle + ventana horaria. */
export function estimateSendTime(
  recipients: number,
  throttlePerMin: number,
  windowStartHr: number,
  windowEndHr: number,
): { totalMin: number; humanReadable: string } {
  if (recipients <= 0 || throttlePerMin <= 0) return { totalMin: 0, humanReadable: "—" };
  const totalMin = Math.ceil(recipients / throttlePerMin);
  const windowHours = Math.max(1, windowEndHr - windowStartHr);
  const windowMin = windowHours * 60;
  const days = Math.ceil(totalMin / windowMin);

  let txt: string;
  if (totalMin < 60)         txt = `${totalMin} min`;
  else if (totalMin < 1440)  txt = `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
  else                       txt = `${days} día${days > 1 ? "s" : ""} (${Math.floor(totalMin / 60)}h totales)`;

  return { totalMin, humanReadable: txt };
}

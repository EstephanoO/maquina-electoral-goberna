import type { ReactNode } from "react";

/* ─── Visual column definitions ─── */

export type VisualColumn =
  | "pendiente"
  | "contactado"
  | "respondido"   // tibio / unscored respondido
  | "voto_blando"
  | "voto_duro"
  | "invalido";

export type ColumnDef = {
  key: VisualColumn;
  label: string;
  accent: string;
  bg: string;
  icon: () => ReactNode;
};

export const COLUMNS: ColumnDef[] = [
  { key: "pendiente",   label: "Pendiente",   accent: "#64748b", bg: "#f8fafc", icon: ClockIcon },
  { key: "contactado",  label: "Contactado",  accent: "#2563eb", bg: "#eff6ff", icon: SendIcon },
  { key: "respondido",  label: "Respondido",  accent: "#0891b2", bg: "#ecfeff", icon: ChatIcon },
  { key: "voto_blando", label: "Voto Blando", accent: "#ca8a04", bg: "#fefce8", icon: StarHalfIcon },
  { key: "voto_duro",   label: "Voto Duro",   accent: "#15803d", bg: "#f0fdf4", icon: StarIcon },
  { key: "invalido",    label: "Inválido",    accent: "#dc2626", bg: "#fef2f2", icon: BanIcon },
];

/* ─── Mapping helpers ─── */

/** Map a backend item (status + vote_class) to a visual column */
export function toVisualColumn(status: string, voteClass: string): VisualColumn {
  if (status === "invalido") return "invalido";
  if (status === "pendiente") return "pendiente";
  if (status === "contactado") return "contactado";
  // respondido or validado
  if (voteClass === "duro") return "voto_duro";
  if (voteClass === "blando") return "voto_blando";
  return "respondido";
}

/** Map a visual column back to backend status */
export function toBackendStatus(col: VisualColumn): string {
  if (col === "voto_blando" || col === "voto_duro" || col === "respondido") return "respondido";
  return col;
}

/** Default tags when dropping into a vote column */
export function defaultTagsForColumn(col: VisualColumn): string[] {
  if (col === "voto_duro") return ["respondio", "amable", "conoce_candidato", "interesado", "voto_seguro"];
  if (col === "voto_blando") return ["respondio", "amable"];
  if (col === "respondido") return ["respondio"];
  return [];
}

/* ─── Vote badges ─── */

export const VOTE_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  duro:   { label: "VOTO DURO",   color: "#15803d", bg: "#dcfce7" },
  blando: { label: "VOTO BLANDO", color: "#ca8a04", bg: "#fef9c3" },
  tibio:  { label: "TIBIO",       color: "#64748b", bg: "#f1f5f9" },
};

/* ─── Allowed drop targets per column ─── */

export function getAllowedTargets(from: VisualColumn): VisualColumn[] {
  switch (from) {
    case "pendiente":   return ["contactado", "invalido"];
    case "contactado":  return ["respondido", "voto_blando", "voto_duro", "invalido"];
    case "respondido":  return ["voto_blando", "voto_duro", "invalido", "contactado"];
    case "voto_blando": return ["voto_duro", "respondido", "invalido"];
    case "voto_duro":   return ["voto_blando", "respondido", "invalido"];
    case "invalido":    return ["pendiente"];
    default:            return [];
  }
}

/* ─── SVG Icons ─── */

export function ClockIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}

export function SendIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>;
}

export function ChatIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
}

export function StarHalfIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>;
}

export function StarIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>;
}

export function BanIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>;
}

export function SearchIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
}

export function XSmallIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}

export function WhatsAppIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function GripIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="opacity-40">
      <circle cx="8" cy="4" r="2" /><circle cx="16" cy="4" r="2" />
      <circle cx="8" cy="12" r="2" /><circle cx="16" cy="12" r="2" />
      <circle cx="8" cy="20" r="2" /><circle cx="16" cy="20" r="2" />
    </svg>
  );
}

/* ─── Helpers ─── */

export function fmtDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    const M = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${d.getDate()} ${M[d.getMonth()]}`;
  } catch { return iso; }
}

export function fmtPhone(tel: string): string {
  const phone = tel.replace(/\D/g, "");
  return phone.length === 9 ? `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}` : tel;
}

export function waLink(tel: string, nombre: string): string {
  const phone = tel.replace(/\D/g, "");
  return `https://web.whatsapp.com/send?phone=51${phone}&text=${encodeURIComponent(`Hola, ${nombre || ""}`)}`;
}

/* ─── WhatsApp opener ─── */

/**
 * Opens WhatsApp Web.
 *
 * If the Goberna extension is installed, the interceptor.js content script
 * catches the window.open call automatically and routes it to the single
 * WhatsApp tab via chrome.tabs API. No special code needed here.
 *
 * If the extension is NOT installed, window.open fires normally (new tab).
 */
export function openWhatsApp(tel: string, nombre: string): void {
  const url = waLink(tel, nombre);
  window.open(url, "_blank");
}

/**
 * Navigation configuration — types, items, and role mapping.
 * Pure data, no React components or hooks.
 */

// ── UI role types ───────────────────────────────────────────────────

/**
 * UI role derived from backend role.
 * Backend roles: admin | consultor | jefe_campana | candidato | brigadista_zonal | agente_campo
 * UI mapping:
 *   admin                    → "admin"      (platform-wide control)
 *   consultor                → "consultor"  (external consultant — restricted data views)
 *   jefe_campana | candidato → "candidato"  (campaign owner — sees their own data)
 *   brigadista_zonal         → "agente"     (field coordinator — minimal web access)
 *   agente_campo             → "agente"     (field agent — minimal web access)
 */
export type UIRole = "admin" | "consultor" | "candidato" | "agente";

export function mapBackendRoleToUI(backendRole: string): UIRole {
  switch (backendRole) {
    case "admin":
      return "admin";
    case "consultor":
      return "consultor";
    case "supervisor":  // legacy alias
    case "jefe_campana":
    case "candidato":
      return "candidato";
    default:
      return "agente";
  }
}

// ── Nav item types ──────────────────────────────────────────────────

export type NavItemKey =
  | "inicio" | "tierra" | "digital" | "datos" | "equipo"
  | "candidatos" | "gestion" | "consultores" | "decks"
  | "brigadistas" | "ops" | "blast"
  | "leads" | "formularios";

/** Pure spec — icons rendered by the shell, not stored here. */
export type NavSpec = {
  key: NavItemKey;
  label: string;
  /** Static href or function that receives campaign slug for dynamic routes */
  href: string | ((campaignSlug: string) => string);
  roles: UIRole[];
  /** When the item is visible: "always" | "campaign" (only with active campaign) | "global" (only Admin General) */
  visibility?: "always" | "campaign" | "global";
};

// ── Main nav (5 items) ──────────────────────────────────────────────

export const MAIN_NAV: NavSpec[] = [
  { key: "inicio",  label: "Inicio",   href: "/inicio",                                  roles: ["admin", "candidato", "consultor", "agente"], visibility: "always" },
  { key: "tierra",  label: "Tierra",   href: (slug) => `/candidatos/${slug}/tierra`,     roles: ["admin", "candidato", "consultor", "agente"], visibility: "campaign" },
  { key: "digital", label: "Digital",  href: (slug) => `/candidatos/${slug}/digital`,    roles: ["admin", "candidato", "consultor"],            visibility: "campaign" },
  { key: "datos",   label: "Datos",    href: (slug) => `/candidatos/${slug}/datos`,      roles: ["admin", "candidato", "consultor"],            visibility: "campaign" },
  { key: "equipo",  label: "Equipo",   href: "/equipo",                                  roles: ["admin", "candidato"],                         visibility: "always" },
];

// ── Admin Hub (collapsible, admin/consultor only) ───────────────────

export const ADMIN_NAV: NavSpec[] = [
  { key: "candidatos",  label: "Candidatos",         href: "/candidatos",  roles: ["admin"],              visibility: "always" },
  { key: "gestion",     label: "Gestión",            href: "/gestion",     roles: ["admin", "consultor"], visibility: "always" },
  { key: "consultores", label: "Consultores",        href: "/consultores", roles: ["admin"],              visibility: "always" },
  { key: "decks",       label: "Decks (revisión)",   href: "/decks",       roles: ["admin"],              visibility: "always" },
  { key: "brigadistas", label: "Brigadistas",        href: "/brigadistas", roles: ["admin"],              visibility: "always" },
  { key: "ops",         label: "Ops",                href: "/ops",         roles: ["admin"],              visibility: "always" },
  { key: "blast",       label: "Blast (multi)",      href: "/blast",       roles: ["admin"],              visibility: "always" },
  { key: "formularios", label: "Formularios (todos)", href: "/formularios", roles: ["admin"],             visibility: "always" },
  { key: "leads",       label: "Leads (TestFlight)", href: "/leads",       roles: ["admin"],              visibility: "always" },
];

// ── Constants ───────────────────────────────────────────────────────

export const SIDEBAR_W_EXPANDED = 260;
export const SIDEBAR_W_COLLAPSED = 72;
export const MOBILE_BREAKPOINT = 768;
export const OPEN_MOBILE_SIDEBAR_EVENT = "goberna:open-mobile-sidebar";

// ── Shared nav link styles ──────────────────────────────────────────

export const navLinkBase: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "inherit",
  transition: "background 0.15s ease, color 0.15s ease",
  whiteSpace: "nowrap",
  textAlign: "left",
  textDecoration: "none",
};

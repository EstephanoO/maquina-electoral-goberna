/**
 * Navigation configuration — types, items, and role mapping.
 * Pure data, no React components or hooks.
 */

import type { ReactNode } from "react";

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

export type NavItem = {
  icon: ReactNode;
  label: string;
  /** Static href or function that receives campaign slug for dynamic routes */
  href: string | ((campaignSlug: string) => string);
  roles: UIRole[];
  section?: "main" | "admin";
  /** When the item is visible: "always" | "campaign" (only with active campaign) | "global" (only Admin General) */
  visibility?: "always" | "campaign" | "global";
};

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

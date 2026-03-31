/**
 * GOBERNA — Application Constants
 * Centralized constants for consistency across the app.
 */

// ── Cargo Options (Peru Electoral System) ──────────────────────────

export const CARGO_OPTIONS = [
  "Senador Nacional",
  "Congresista",
  "Presidente Regional",
  "Vicepresidente Regional",
  "Consejero Regional",
  "Alcalde Provincial",
  "Alcalde Distrital",
  "Regidor Provincial",
  "Regidor Distrital",
] as const;

export type CargoOption = (typeof CARGO_OPTIONS)[number];

/** Cargos congresales — muestran "Número de candidatura" */
export const CARGOS_CONGRESALES: readonly CargoOption[] = [
  "Congresista",
  "Senador Nacional",
] as const;

/** Cargos subnacionales — muestran "Nombre del partido" */
export const CARGOS_SUBNACIONALES: readonly CargoOption[] = [
  "Presidente Regional",
  "Vicepresidente Regional",
  "Consejero Regional",
  "Alcalde Provincial",
  "Alcalde Distrital",
  "Regidor Provincial",
  "Regidor Distrital",
] as const;

/** Check if a cargo should show "Número de candidatura" */
export function isCargoCongresal(cargo: string): boolean {
  return (CARGOS_CONGRESALES as readonly string[]).includes(cargo);
}

/** Check if a cargo should show "Nombre del partido" */
export function isCargoSubnacional(cargo: string): boolean {
  return (CARGOS_SUBNACIONALES as readonly string[]).includes(cargo);
}

// ── Status Configurations ──────────────────────────────────────────

export const STATUS_CONFIG = {
  pending: { bg: "var(--color-warning-bg)", color: "var(--color-warning)", label: "Pendiente" },
  approved: { bg: "var(--color-success-bg)", color: "var(--color-success)", label: "Aprobada" },
  rejected: { bg: "var(--color-error-bg)", color: "var(--color-error)", label: "Rechazada" },
  active: { bg: "var(--color-success-bg)", color: "var(--color-success)", label: "Activo" },
  paused: { bg: "var(--color-warning-bg)", color: "var(--color-warning)", label: "Pausado" },
  archived: { bg: "var(--color-surface-active)", color: "var(--color-text-tertiary)", label: "Archivado" },
  draft: { bg: "var(--color-surface-active)", color: "var(--color-text-tertiary)", label: "Borrador" },
} as const;

// ── Default Colors ─────────────────────────────────────────────────

export const DEFAULT_COLORS = {
  primario: "#163960",
  secundario: "#fbbf24",
} as const;

// ── Upload Limits ──────────────────────────────────────────────────

export const UPLOAD_CONFIG = {
  maxSizeBytes: 5 * 1024 * 1024, // 5MB
  maxSizeMB: 5,
  allowedTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"] as const,
} as const;

// ── Font Stack ─────────────────────────────────────────────────────

export const FONT_STACK = "var(--font-montserrat), system-ui, sans-serif";

// ── Animation Keyframes (for injection) ────────────────────────────

/** @deprecated — animations are now defined in globals.css. Keep for backward compat. */
export const GOBERNA_KEYFRAMES = `
@keyframes goberna-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes goberna-spin {
  to { transform: rotate(360deg); }
}
@keyframes goberna-slide-in {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0); opacity: 1; }
}
@keyframes goberna-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
`;

// ── Storage Keys ───────────────────────────────────────────────────
// NOTE: Auth tokens are now in httpOnly cookies (not localStorage).
// Only non-sensitive preferences remain here.

export const STORAGE_KEYS = {
  activeCampaign: "goberna_active_campaign",
  user: "goberna_user",
} as const;

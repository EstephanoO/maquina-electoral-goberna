import type { DrillState } from "./_components";
import type { FormRecord } from "@/lib/services";

/* ─── Demo: Carmen de la Legua (Callao) ─── */

/**
 * Slugs de campaña que activan la demo de Edwards Infante.
 * Agregá el slug real cuando se cree la campaña en el sistema.
 */
export const LEGUA_DEMO_SLUGS = ["edwards-infante", "carmen-de-la-legua", "legua-demo"] as const;

/**
 * DrillState para Carmen de la Legua Reynoso.
 * Fuente: GET /api/geo/provincias/0701/distritos (DB producción, 2026-03-07)
 * Dep. Callao (07) → Prov. Callao (0701) → Dist. Carmen de la Legua (070103)
 */
export const LEGUA_DRILL: DrillState = {
  level: 3,
  depCode: "07",
  depName: "CALLAO",
  provCode: "0701",
  provName: "CALLAO",
  distCode: "070103",
  distName: "Carmen de la Legua Reynoso",
  sector: null,
  sectorName: null,
};

/**
 * Bounds exactos de Carmen de la Legua Reynoso.
 * Fuente: GET /api/geo/provincias/0701/distritos — geometría PostGIS de producción.
 * [[minLng, minLat], [maxLng, maxLat]]
 */
export const LEGUA_BOUNDS: [[number, number], [number, number]] = [
  [-77.09924822899995, -12.04841197199994],  // SW
  [-77.08161107999996, -12.036319686999946], // NE
];

export const EMPTY_FORMS: FormRecord[] = [];
export const TIERRA_FULLSCREEN_CLASS = "tierra-fullscreen";
export const LEFT_PANEL_W = 176;
export const TABBAR_THEME_VARS = [
  "--tierra-tabbar-bg",
  "--tierra-tabbar-border",
  "--tierra-tab-inactive-color",
  "--tierra-tab-active-color",
  "--tierra-tab-active-bg",
  "--tierra-tab-hover-bg",
  "--tierra-tab-indicator",
] as const;

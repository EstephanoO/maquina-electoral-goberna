/**
 * useZoneTooltip — Minimal zone tooltip.
 *
 * Shows only what matters at a glance: zone name, captures, and pace status.
 * Zero React re-renders — direct DOM manipulation + rAF position coalescing.
 */

import { useCallback, useRef, type RefObject } from "react";
import type { MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type { FormPoint, EnrichedAgent } from "../types";

// ─── Electoral data (JNE/ONPE 2026 projection) ───────────────────────────────

type DepData = { nombre: string; datos_necesita: number };

const DEP_DATA: DepData[] = [
  { nombre: "AMAZONAS",      datos_necesita:  20_116 },
  { nombre: "ANCASH",        datos_necesita:  56_599 },
  { nombre: "APURIMAC",      datos_necesita:  21_054 },
  { nombre: "AREQUIPA",      datos_necesita:  71_465 },
  { nombre: "AYACUCHO",      datos_necesita:  30_312 },
  { nombre: "CAJAMARCA",     datos_necesita:  69_848 },
  { nombre: "CALLAO",        datos_necesita:  50_049 },
  { nombre: "CUSCO",         datos_necesita:  66_059 },
  { nombre: "HUANCAVELICA",  datos_necesita:  19_778 },
  { nombre: "HUANUCO",       datos_necesita:  38_253 },
  { nombre: "ICA",           datos_necesita:  41_602 },
  { nombre: "JUNIN",         datos_necesita:  61_908 },
  { nombre: "LA LIBERTAD",   datos_necesita:  90_469 },
  { nombre: "LAMBAYEQUE",    datos_necesita:  61_258 },
  { nombre: "LIMA",          datos_necesita: 504_061 },
  { nombre: "LORETO",        datos_necesita:  38_464 },
  { nombre: "MADRE DE DIOS", datos_necesita:   7_693 },
  { nombre: "MOQUEGUA",      datos_necesita:  10_193 },
  { nombre: "PASCO",         datos_necesita:  13_298 },
  { nombre: "PIURA",         datos_necesita:  79_248 },
  { nombre: "PUNO",          datos_necesita:  64_358 },
  { nombre: "SAN MARTIN",    datos_necesita:  39_924 },
  { nombre: "TACNA",         datos_necesita:  14_900 },
  { nombre: "TUMBES",        datos_necesita:   7_243 },
  { nombre: "UCAYALI",       datos_necesita:  19_994 },
];

const DEP_INDEX = new Map<string, DepData>(DEP_DATA.map((d) => [d.nombre, d]));
const ALIASES: Record<string, string> = {
  "SAN MARTÍN": "SAN MARTIN",
  "APURÍMAC":   "APURIMAC",
  "HUÁNUCO":    "HUANUCO",
  "JUNÍN":      "JUNIN",
};

function getDep(raw: string): DepData | null {
  const up = raw.toUpperCase().trim();
  return DEP_INDEX.get(ALIASES[up] ?? up) ?? null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ELECTION_DATE = new Date("2026-04-12T08:00:00-05:00");
const OFFSET_X = 14;
const OFFSET_Y = -10;

function daysLeft(): number {
  return Math.max(1, Math.ceil((ELECTION_DATE.getTime() - Date.now()) / 86_400_000));
}

function fmt(v: number): string {
  return Math.round(v).toLocaleString("es-PE");
}

// ─── Feature extraction ───────────────────────────────────────────────────────

type ZoneInfo = {
  name: string;
  level: "dep" | "prov" | "dist" | "sector";
  depName: string | null;
  key: string;
};

function extract(layerId: string, props: Record<string, unknown>): ZoneInfo | null {
  if (layerId === "dep-fill" || layerId === "priority-dep-fill") {
    const name = String(props.departamento ?? props.DEPARTAMEN ?? "").trim();
    const code = String(props.coddep ?? "").slice(0, 2);
    if (!name) return null;
    return { name, level: "dep", depName: name, key: `dep:${code || name}` };
  }
  if (layerId === "prov-fill" || layerId === "priority-prov-fill") {
    const name = String(props.provincia ?? props.PROVINCIA ?? "").trim();
    const code = String(props.codprov_full ?? "").slice(0, 4);
    const dep  = String(props.departamento ?? props.DEPARTAMEN ?? "").trim() || null;
    if (!name) return null;
    return { name, level: "prov", depName: dep, key: `prov:${code || name}` };
  }
  if (layerId === "dist-fill" || layerId === "priority-dist-fill") {
    const name = String(props.distrito ?? props.DISTRITO ?? "").trim();
    const ub   = String(props.ubigeo ?? "").slice(0, 6);
    const dep  = String(props.departamento ?? props.DEPARTAMEN ?? "").trim() || null;
    if (!name) return null;
    return { name, level: "dist", depName: dep, key: `dist:${ub || name}` };
  }
  if (layerId === "sector-fill") {
    const name = String(props.zone_name ?? props.SECTOR ?? "").trim();
    if (!name) return null;
    return { name, level: "sector", depName: null, key: `sector:${name}` };
  }
  return null;
}

// ─── HTML builder — minimal ───────────────────────────────────────────────────

function buildHTML(zone: ZoneInfo, totalForms: number, depCounts: Map<string, number>): string {
  const dep = zone.depName ? getDep(zone.depName) : null;

  // Level label
  const levelLabel =
    zone.level === "dep"    ? "Departamento" :
    zone.level === "prov"   ? "Provincia" :
    zone.level === "dist"   ? "Distrito" :
                              "Sector";

  // For dep level: show progress toward goal
  if (dep && zone.level === "dep") {
    // Use real count from enriched departamento field when available,
    // fall back to proportional estimate only when no enriched data exists.
    const depKey = zone.depName!.toUpperCase().trim();
    const realCount = depCounts.get(ALIASES[depKey] ?? depKey) ?? depCounts.get(depKey);
    const hasRealData = depCounts.size > 0;
    const captured = hasRealData
      ? (realCount ?? 0)
      : Math.round(totalForms * (dep.datos_necesita / DEP_DATA.reduce((s, d) => s + d.datos_necesita, 0)));
    const pct = dep.datos_necesita > 0
      ? Math.min(100, (captured / dep.datos_necesita) * 100)
      : 0;
    const d = daysLeft();

    // Pace: captured per day needed vs actual
    const needed = dep.datos_necesita > 0 ? dep.datos_necesita / d : 0;
    const actual = d > 0 ? captured / d : captured;
    const ratio = needed > 0 ? actual / needed : 1;

    const stateColor =
      ratio >= 0.8 ? "#4ade80" :
      ratio >= 0.4 ? "#fbbf24" :
                     "#f87171";

    const stateLabel =
      ratio >= 0.8 ? "En ritmo" :
      ratio >= 0.4 ? "Atención" :
                     "Crítico";

    const barW = captured > 0 ? Math.max(pct, 2) : 0;

    return `<div style="font-family:system-ui,sans-serif;width:188px;padding:2px 0">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
    <div>
      <div style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">${levelLabel}</div>
      <div style="font-size:14px;font-weight:700;color:#fff;line-height:1">${zone.name}</div>
    </div>
    <div style="font-size:9px;font-weight:700;color:${stateColor};background:${stateColor}22;border:1px solid ${stateColor}44;border-radius:4px;padding:2px 6px;white-space:nowrap">${stateLabel}</div>
  </div>
  <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">
    <span style="font-size:11px;color:rgba(255,255,255,0.5)">Capturas</span>
    <span style="font-size:13px;font-weight:700;color:#fff">${fmt(captured)} <span style="font-size:10px;font-weight:400;color:rgba(255,255,255,0.4)">/ ${fmt(dep.datos_necesita)}</span></span>
  </div>
  <div style="height:3px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden">
    <div style="height:100%;width:${barW}%;background:${stateColor};border-radius:2px"></div>
  </div>
</div>`.trim();
  }

  // Prov / dist / sector — just name + level
  return `<div style="font-family:system-ui,sans-serif;padding:2px 0">
  <div style="font-size:9px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">${levelLabel}</div>
  <div style="font-size:14px;font-weight:700;color:#fff">${zone.name}</div>
</div>`.trim();
}

// ─── Tooltip state ────────────────────────────────────────────────────────────

type TooltipState = {
  x: number;
  y: number;
  currentKey: string | null;
  rafPending: boolean;
};

export type ZoneTooltipOptions = {
  forms?: FormPoint[];
  agents?: EnrichedAgent[];
  primaryColor?: string;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useZoneTooltip(
  isZoomingRef: RefObject<boolean>,
  options?: ZoneTooltipOptions,
) {
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const state = useRef<TooltipState>({ x: 0, y: 0, currentKey: null, rafPending: false });

  const totalForms = options?.forms?.length ?? 0;

  // Build real count per department from enriched form data
  const depCounts = useRef<Map<string, number>>(new Map());
  const prevFormsLen = useRef(0);
  if ((options?.forms?.length ?? 0) !== prevFormsLen.current) {
    prevFormsLen.current = options?.forms?.length ?? 0;
    const m = new Map<string, number>();
    for (const f of options?.forms ?? []) {
      if (f.departamento) {
        const key = f.departamento.toUpperCase().trim();
        m.set(key, (m.get(key) ?? 0) + 1);
      }
    }
    depCounts.current = m;
  }

  const flushPosition = useCallback(() => {
    const el = tooltipRef.current;
    const s = state.current;
    s.rafPending = false;
    if (!el) return;
    el.style.transform = `translate(${s.x + OFFSET_X}px, ${s.y + OFFSET_Y}px)`;
  }, []);

  const onMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const el = tooltipRef.current;
    if (!el) return;

    if (isZoomingRef.current) {
      if (state.current.currentKey !== null) { el.style.opacity = "0"; state.current.currentKey = null; }
      return;
    }

    const features = e.features;
    if (!features?.length) {
      if (state.current.currentKey !== null) { el.style.opacity = "0"; state.current.currentKey = null; }
      return;
    }

    const f = features[0];
    const zone = extract(f.layer?.id ?? "", f.properties ?? {});
    if (!zone) {
      if (state.current.currentKey !== null) { el.style.opacity = "0"; state.current.currentKey = null; }
      return;
    }

    if (zone.key !== state.current.currentKey) {
      state.current.currentKey = zone.key;
      el.innerHTML = buildHTML(zone, totalForms, depCounts.current);
      el.style.opacity = "1";
    }

    state.current.x = e.point.x;
    state.current.y = e.point.y;
    if (!state.current.rafPending) {
      state.current.rafPending = true;
      requestAnimationFrame(flushPosition);
    }
  }, [isZoomingRef, flushPosition, totalForms, depCounts]);

  const onMouseLeave = useCallback(() => {
    const el = tooltipRef.current;
    if (el && state.current.currentKey !== null) {
      el.style.opacity = "0";
      state.current.currentKey = null;
    }
  }, []);

  return { tooltipRef, onMouseMove, onMouseLeave } as const;
}

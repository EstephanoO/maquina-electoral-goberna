/**
 * useZoneTooltip — High-performance zone tooltip via direct DOM manipulation.
 *
 * Una sola pregunta: ¿cómo vamos aquí?
 * Jerarquía: estado → déficit → predicción → capacidad operativa.
 *
 * Performance:
 * - DOM directo, cero React re-renders durante mousemove
 * - rAF coalesce: un write por frame máximo
 * - innerHTML solo cambia cuando cambia la zona hover, no por pixel
 */

import { useCallback, useRef, type RefObject } from "react";
import type { MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type { FormPoint, EnrichedAgent } from "../types";

// ─── Datos electorales reales (JNE/ONPE proyección 2026) ─────────────────────

type DepData = {
  nombre:          string;   // exactamente como llega del tile MVT
  total:           number;   // padrón electoral total
  votos_validos:   number;   // votos válidos proyectados
  votos_necesita:  number;   // 5% de votos válidos = objetivo mínimo
  datos_necesita:  number;   // fichas de contacto necesarias
  porcentaje:      number;   // % del padrón nacional
};

const DEP_DATA: DepData[] = [
  { nombre: "AMAZONAS",      total:   345_245, votos_validos:   201_160, votos_necesita:  10_058, datos_necesita:  20_116, porcentaje: 1.322  },
  { nombre: "ANCASH",        total:   971_385, votos_validos:   565_987, votos_necesita:  28_299, datos_necesita:  56_599, porcentaje: 3.720  },
  { nombre: "APURIMAC",      total:   361_338, votos_validos:   210_537, votos_necesita:  10_527, datos_necesita:  21_054, porcentaje: 1.384  },
  { nombre: "AREQUIPA",      total: 1_226_525, votos_validos:   714_647, votos_necesita:  35_732, datos_necesita:  71_465, porcentaje: 4.697  },
  { nombre: "AYACUCHO",      total:   520_238, votos_validos:   303_122, votos_necesita:  15_156, datos_necesita:  30_312, porcentaje: 1.992  },
  { nombre: "CAJAMARCA",     total: 1_198_773, votos_validos:   698_477, votos_necesita:  34_924, datos_necesita:  69_848, porcentaje: 4.590  },
  { nombre: "CALLAO",        total:   858_968, votos_validos:   500_486, votos_necesita:  25_024, datos_necesita:  50_049, porcentaje: 3.289  },
  { nombre: "CUSCO",         total: 1_133_754, votos_validos:   660_593, votos_necesita:  33_030, datos_necesita:  66_059, porcentaje: 4.341  },
  { nombre: "HUANCAVELICA",  total:   339_448, votos_validos:   197_783, votos_necesita:   9_889, datos_necesita:  19_778, porcentaje: 1.300  },
  { nombre: "HUANUCO",       total:   656_517, votos_validos:   382_526, votos_necesita:  19_126, datos_necesita:  38_253, porcentaje: 2.514  },
  { nombre: "ICA",           total:   713_997, votos_validos:   416_017, votos_necesita:  20_801, datos_necesita:  41_602, porcentaje: 2.734  },
  { nombre: "JUNIN",         total: 1_062_500, votos_validos:   619_076, votos_necesita:  30_954, datos_necesita:  61_908, porcentaje: 4.069  },
  { nombre: "LA LIBERTAD",   total: 1_552_691, votos_validos:   904_691, votos_necesita:  45_235, datos_necesita:  90_469, porcentaje: 5.946  },
  { nombre: "LAMBAYEQUE",    total: 1_051_350, votos_validos:   612_580, votos_necesita:  30_629, datos_necesita:  61_258, porcentaje: 4.026  },
  { nombre: "LIMA",          total: 8_651_028, votos_validos: 5_040_608, votos_necesita: 252_030, datos_necesita: 504_061, porcentaje: 33.127 },
  { nombre: "LORETO",        total:   659_780, votos_validos:   384_638, votos_necesita:  19_232, datos_necesita:  38_464, porcentaje: 2.526  },
  { nombre: "MADRE DE DIOS", total:   131_960, votos_validos:    76_932, votos_necesita:   3_847, datos_necesita:   7_693, porcentaje: 0.505  },
  { nombre: "MOQUEGUA",      total:   174_880, votos_validos:   101_929, votos_necesita:   5_096, datos_necesita:  10_193, porcentaje: 0.670  },
  { nombre: "PASCO",         total:   228_160, votos_validos:   132_978, votos_necesita:   6_649, datos_necesita:  13_298, porcentaje: 0.873  },
  { nombre: "PIURA",         total: 1_359_940, votos_validos:   792_483, votos_necesita:  39_624, datos_necesita:  79_248, porcentaje: 5.207  },
  { nombre: "PUNO",          total: 1_104_380, votos_validos:   643_577, votos_necesita:  32_179, datos_necesita:  64_358, porcentaje: 4.228  },
  { nombre: "SAN MARTIN",    total:   684_900, votos_validos:   399_237, votos_necesita:  19_962, datos_necesita:  39_924, porcentaje: 2.622  },
  { nombre: "TACNA",         total:   255_580, votos_validos:   148_999, votos_necesita:   7_450, datos_necesita:  14_900, porcentaje: 0.979  },
  { nombre: "TUMBES",        total:   124_260, votos_validos:    72_430, votos_necesita:   3_622, datos_necesita:   7_243, porcentaje: 0.476  },
  { nombre: "UCAYALI",       total:   343_040, votos_validos:   199_935, votos_necesita:   9_997, datos_necesita:  19_994, porcentaje: 1.315  },
];

// Lookup O(1) por nombre uppercase
const DEP_INDEX = new Map<string, DepData>(DEP_DATA.map((d) => [d.nombre, d]));

// Acentos que llegan del tile
const ALIASES: Record<string, string> = {
  "SAN MARTÍN": "SAN MARTIN",
  "APURÍMAC":   "APURIMAC",
  "HUÁNUCO":    "HUANUCO",
  "JUNÍN":      "JUNIN",
  "PASCO":      "PASCO",
};

function getDep(raw: string): DepData | null {
  const up = raw.toUpperCase().trim();
  return DEP_INDEX.get(ALIASES[up] ?? up) ?? null;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const ELECTION_DATE     = new Date("2026-04-12T08:00:00-05:00");
const FICHAS_POR_BRIG   = 10;   // fichas/brigadista/día — rendimiento base
const TOTAL_PADRON_NAC  = DEP_DATA.reduce((s, d) => s + d.total, 0);

// ─── Tipos ───────────────────────────────────────────────────────────────────

type TooltipState = {
  x: number; y: number;
  currentKey: string | null;
  rafPending: boolean;
};

export type ZoneTooltipOptions = {
  forms:        FormPoint[];
  agents:       EnrichedAgent[];
  metaVotos?:   number;
  primaryColor?: string;
};

// ─── Offset cursor ────────────────────────────────────────────────────────────

const OFFSET_X = 16;
const OFFSET_Y = -12;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dias(): number {
  return Math.max(1, Math.ceil((ELECTION_DATE.getTime() - Date.now()) / 86_400_000));
}

/** Número con separador de miles español: 19965 → "19,965" */
function n(v: number): string {
  return Math.round(v).toLocaleString("es-PE");
}

// ─── Extracción del feature tile ──────────────────────────────────────────────

type ZoneInfo = {
  name:    string;
  level:   "dep" | "prov" | "dist" | "sector";
  depName: string | null;
  key:     string;
};

function extract(layerId: string, props: Record<string, unknown>): ZoneInfo | null {
  if (layerId === "dep-fill" || layerId === "priority-dep-fill" || layerId === "geo-dep-fill") {
    const name = String(props.departamento ?? props.DEPARTAMEN ?? "").trim();
    const coddep = String(props.coddep ?? "").slice(0, 2);
    if (!name) return null;
    return { name, level: "dep", depName: name, key: `dep:${coddep || name}` };
  }
  if (layerId === "prov-fill" || layerId === "priority-prov-fill" || layerId === "geo-prov-fill") {
    const name = String(props.provincia ?? props.PROVINCIA ?? "").trim();
    const cod  = String(props.codprov_full ?? "").slice(0, 4);
    const dep  = String(props.departamento ?? props.DEPARTAMEN ?? "").trim() || null;
    if (!name) return null;
    return { name, level: "prov", depName: dep, key: `prov:${cod || name}` };
  }
  if (layerId === "dist-fill" || layerId === "priority-dist-fill" || layerId === "geo-dist-fill") {
    const name = String(props.distrito ?? props.DISTRITO ?? "").trim();
    const ub   = String(props.ubigeo ?? "").slice(0, 6);
    const dep  = String(props.departamento ?? props.DEPARTAMEN ?? "").trim() || null;
    if (!name) return null;
    return { name, level: "dist", depName: dep, key: `dist:${ub || name}` };
  }
  if (layerId === "sector-fill" || layerId === "geo-sector-fill") {
    const name = String(props.zone_name ?? props.SECTOR ?? "").trim();
    if (!name) return null;
    return { name, level: "sector", depName: null, key: `sector:${name}` };
  }
  if (layerId === "geo-subsector-fill") {
    const name = String(props.zone_name ?? props.SUBSECTOR ?? "").trim();
    if (!name) return null;
    return { name, level: "sector", depName: null, key: `subsector:${name}` };
  }
  return null;
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildHTML(
  zone:         ZoneInfo,
  totalForms:   number,
  agents:       EnrichedAgent[],
  primaryColor: string,
): string {

  const d    = dias();
  const dep  = zone.depName ? getDep(zone.depName) : null;

  // Peso de este departamento en el padrón nacional
  const peso = dep ? dep.total / TOTAL_PADRON_NAC : 0;

  // Capturas estimadas en esta zona (proporcional al padrón)
  const capturasDep = Math.round(totalForms * peso);

  // Brigadistas estimados en esta zona
  const brigDep = Math.round(agents.length * peso);

  // Fichas/día actuales del equipo completo → escalo por peso del dep
  const fichasTotalesHoy = agents.reduce((s, a) => s + a.forms_count, 0);
  const fichasDiaNac     = d > 0 ? fichasTotalesHoy / d : 0;   // histórico / días transcurridos
  const fichasDiaDep     = fichasDiaNac * peso;

  // Solo mostramos inteligencia electoral en nivel dep
  if (dep && zone.level === "dep") {
    const faltanFichas = Math.max(0, dep.datos_necesita - capturasDep);
    const faltanVotos  = Math.max(0, dep.votos_necesita - Math.round(capturasDep * 0.5)); // tasa conversión 50%

    // Fichas/día necesarias para cerrar el déficit antes de la elección
    const fichasNecDia = d > 0 ? faltanFichas / d : faltanFichas;

    // Brigadistas necesarios para cubrir esa cadencia
    const brigNecesarios = Math.ceil(fichasNecDia / FICHAS_POR_BRIG);

    // Estado: ¿vamos bien?
    const ratio = faltanFichas === 0 ? 1 : fichasDiaDep / fichasNecDia;
    const estado: "ok" | "riesgo" | "critico" =
      ratio >= 0.8 ? "ok" :
      ratio >= 0.4 ? "riesgo" :
      "critico";

    const colorEstado =
      estado === "ok"      ? "#4ade80" :   // green-400
      estado === "riesgo"  ? "#facc15" :   // yellow-400
                             "#f87171";    // red-400

    const labelEstado =
      estado === "ok"      ? "En ritmo" :
      estado === "riesgo"  ? "En riesgo" :
      "Ritmo crítico";

    const avancePct = dep.datos_necesita > 0
      ? Math.min(100, (capturasDep / dep.datos_necesita) * 100)
      : 0;

    // Ancho de barra: mínimo visible si hay algo
    const barW = capturasDep > 0 ? Math.max(avancePct, 1.5) : 0;

    return `<div style="font-family:'Inter',system-ui,sans-serif;width:216px;">

  <!-- Header: nombre + estado -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px;">
    <div>
      <div style="font-size:8px;font-weight:700;letter-spacing:1.6px;color:#facc15;text-transform:uppercase;margin-bottom:3px;">Departamento · ${dep.porcentaje.toFixed(2)}% nac.</div>
      <div style="font-size:15px;font-weight:700;color:#fef08a;line-height:1.1;">${zone.name}</div>
    </div>
    <div style="flex-shrink:0;margin-top:2px;padding:3px 7px;border-radius:4px;background:${colorEstado}30;border:1px solid ${colorEstado}80;">
      <span style="font-size:8px;font-weight:700;color:${colorEstado};letter-spacing:0.8px;text-transform:uppercase;white-space:nowrap;">${labelEstado}</span>
    </div>
  </div>

  <!-- Barra de progreso -->
  <div style="margin-bottom:3px;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
      <span style="font-size:8px;font-weight:600;letter-spacing:1.2px;color:#facc15;text-transform:uppercase;">Progreso fichas</span>
      <span style="font-size:10px;font-weight:700;color:${colorEstado};">${avancePct.toFixed(1)}%</span>
    </div>
    <div style="height:4px;background:rgba(51,65,85,0.9);border-radius:2px;overflow:hidden;">
      <div style="height:100%;width:${barW}%;background:${colorEstado};border-radius:2px;"></div>
    </div>
  </div>

  <!-- Separador -->
  <div style="height:1px;background:rgba(250,204,21,0.2);margin:10px 0;"></div>

  <!-- VOTOS — lo más accionable -->
  <div style="margin-bottom:2px;">
    <div style="font-size:8px;font-weight:700;letter-spacing:1.2px;color:#facc15;text-transform:uppercase;margin-bottom:6px;">Votos</div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;">
      <span style="font-size:9px;color:#fde68a;">Objetivo (5%)</span>
      <span style="font-size:11px;font-weight:600;color:#fef08a;">${n(dep.votos_necesita)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;">
      <span style="font-size:9px;color:#fde68a;">Faltan</span>
      <span style="font-size:13px;font-weight:700;color:${colorEstado};">${n(faltanVotos)}</span>
    </div>
  </div>

  <!-- Separador -->
  <div style="height:1px;background:rgba(250,204,21,0.2);margin:10px 0;"></div>

  <!-- FICHAS -->
  <div style="margin-bottom:2px;">
    <div style="font-size:8px;font-weight:700;letter-spacing:1.2px;color:#facc15;text-transform:uppercase;margin-bottom:6px;">Fichas</div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;">
      <span style="font-size:9px;color:#fde68a;">Necesarias</span>
      <span style="font-size:11px;font-weight:600;color:#fef08a;">${n(dep.datos_necesita)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;">
      <span style="font-size:9px;color:#fde68a;">Capturadas</span>
      <span style="font-size:11px;font-weight:600;color:#fef08a;">${n(capturasDep)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;">
      <span style="font-size:9px;color:#fde68a;">Faltan</span>
      <span style="font-size:11px;font-weight:700;color:${colorEstado};">${n(faltanFichas)}</span>
    </div>
  </div>

  <!-- Separador -->
  <div style="height:1px;background:rgba(250,204,21,0.2);margin:10px 0;"></div>

  <!-- PREDICCIÓN — la métrica más valiosa -->
  <div style="margin-bottom:2px;">
    <div style="font-size:8px;font-weight:700;letter-spacing:1.2px;color:#facc15;text-transform:uppercase;margin-bottom:6px;">Predicción · ${d}d al 12 abr</div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;">
      <span style="font-size:9px;color:#fde68a;">Fichas/día necesarias</span>
      <span style="font-size:11px;font-weight:700;color:${colorEstado};">${n(fichasNecDia)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;">
      <span style="font-size:9px;color:#fde68a;">Ritmo actual</span>
      <span style="font-size:11px;font-weight:600;color:#fef08a;">${n(fichasDiaDep)}/día</span>
    </div>
  </div>

  <!-- Separador -->
  <div style="height:1px;background:rgba(250,204,21,0.2);margin:10px 0;"></div>

  <!-- BRIGADISTAS -->
  <div>
    <div style="font-size:8px;font-weight:700;letter-spacing:1.2px;color:#facc15;text-transform:uppercase;margin-bottom:6px;">Brigadistas</div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;">
      <span style="font-size:9px;color:#fde68a;">Actuales / Recomendados</span>
      <span style="font-size:12px;font-weight:700;color:${brigDep >= brigNecesarios ? "#4ade80" : colorEstado};">${brigDep} / ${brigNecesarios}</span>
    </div>
  </div>

</div>`.trim();
  }

  // ── Nivel provincia / distrito / sector — versión compacta ────────────────
  return `<div style="font-family:'Inter',system-ui,sans-serif;width:200px;">
  <div style="font-size:8px;font-weight:700;letter-spacing:1.6px;color:#facc15;text-transform:uppercase;margin-bottom:4px;">${
    zone.level === "prov" ? "Provincia" : zone.level === "dist" ? "Distrito" : "Sector"
  }</div>
  <div style="font-size:14px;font-weight:700;color:#fef08a;margin-bottom:10px;">${zone.name}</div>
  <div style="height:1px;background:rgba(250,204,21,0.2);margin-bottom:8px;"></div>
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;">
    <span style="font-size:9px;color:#fde68a;">Capturas campaña</span>
    <span style="font-size:12px;font-weight:700;color:#fef08a;">${n(totalForms)}</span>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:baseline;">
    <span style="font-size:9px;color:#fde68a;">Días al 12 abr</span>
    <span style="font-size:9px;font-weight:600;color:${d <= 14 ? "#f87171" : d <= 30 ? "#facc15" : "#fef08a"};">${d}d</span>
  </div>
</div>`.trim();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useZoneTooltip(
  isZoomingRef: RefObject<boolean>,
  options?: ZoneTooltipOptions,
) {
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const state = useRef<TooltipState>({ x: 0, y: 0, currentKey: null, rafPending: false });

  const totalForms   = options?.forms?.length   ?? 0;
  const agents       = options?.agents          ?? [];
  const primaryColor = options?.primaryColor    ?? "#3b82f6";

  const flushPosition = useCallback(() => {
    const el = tooltipRef.current;
    const s  = state.current;
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

    const f      = features[0];
    const zone   = extract(f.layer?.id ?? "", f.properties ?? {});
    if (!zone) {
      if (state.current.currentKey !== null) { el.style.opacity = "0"; state.current.currentKey = null; }
      return;
    }

    if (zone.key !== state.current.currentKey) {
      state.current.currentKey = zone.key;
      el.innerHTML = buildHTML(zone, totalForms, agents, primaryColor);
      el.style.opacity = "1";
    }

    state.current.x = e.point.x;
    state.current.y = e.point.y;
    if (!state.current.rafPending) {
      state.current.rafPending = true;
      requestAnimationFrame(flushPosition);
    }
  }, [isZoomingRef, flushPosition, totalForms, agents, primaryColor]);

  const onMouseLeave = useCallback(() => {
    const el = tooltipRef.current;
    if (el && state.current.currentKey !== null) {
      el.style.opacity = "0";
      state.current.currentKey = null;
    }
  }, []);

  return { tooltipRef, onMouseMove, onMouseLeave } as const;
}

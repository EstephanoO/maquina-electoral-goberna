/**
 * useFormTooltip — Minimal tooltip for form points, clusters, and agents.
 *
 * Zero React re-renders — direct DOM manipulation + rAF position coalescing.
 * Cluster ranking is async-enriched after initial render and cached.
 * Pinned tooltip persists after flyTo from datos view.
 */

import { useCallback, useRef, type RefObject } from "react";
import type { MapRef, MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type { GeoJSONSource } from "maplibre-gl";
import type { PinnedTooltipData } from "../types";

// ─── Constants ────────────────────────────────────────────────────────────────

const OFFSET_X = 12;
const OFFSET_Y = -10;
const MAX_LEAVES = 200;
const MAX_RANKING = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** "2026-02-15T03:42:00Z" → "15 feb · 03:42" */
function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    const M = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    return `${d.getDate()} ${M[d.getMonth()]} · ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  } catch { return ""; }
}

/** "987654321" → "987 654 321" */
function fmtPhone(tel: string): string {
  const c = tel.replace(/\D/g, "");
  if (c.length === 9) return `${c.slice(0,3)} ${c.slice(3,6)} ${c.slice(6)}`;
  return tel;
}

// ─── HTML builders ────────────────────────────────────────────────────────────

/** Single form point — name (bold) + phone + encuestador + date */
function htmlFormPoint(nombre: string, telefono: string, encuestador: string, createdAt: string): string {
  return `<div style="font-family:system-ui,sans-serif">
  <div style="font-size:13px;font-weight:700;color:#1e293b;line-height:1.3;margin-bottom:${telefono ? 2 : 6}px">${nombre || "—"}</div>
  ${telefono ? `<div style="font-size:11px;color:#475569;margin-bottom:6px;font-variant-numeric:tabular-nums">${fmtPhone(telefono)}</div>` : ""}
  <div style="display:flex;align-items:center;gap:6px;padding-top:5px;border-top:1px solid #f1f5f9">
    ${encuestador ? `<span style="font-size:10px;font-weight:600;color:#64748b">${encuestador.split(" ")[0]}</span>` : ""}
    ${createdAt ? `<span style="font-size:9px;color:#94a3b8;margin-left:auto">${fmtDate(createdAt)}</span>` : ""}
  </div>
</div>`.trim();
}

/** Cluster — count + optional top-3 ranking */
function htmlCluster(count: number, ranking?: { name: string; count: number }[]): string {
  const MEDALS = ["🥇","🥈","🥉"];
  const rows = ranking?.slice(0, MAX_RANKING).map((r, i) =>
    `<div style="display:flex;align-items:center;gap:5px;margin-top:4px">
      <span style="font-size:10px;width:16px">${MEDALS[i] ?? `${i+1}.`}</span>
      <span style="font-size:10px;color:#475569;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.name}</span>
      <span style="font-size:10px;font-weight:700;color:#2563eb">${r.count}</span>
    </div>`
  ).join("") ?? "";

  return `<div style="font-family:system-ui,sans-serif">
  <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:${rows ? 6 : 0}px">
    <span style="font-size:15px;font-weight:800;color:#1e293b">${count}</span>
    <span style="font-size:10px;color:#94a3b8">datos · click para expandir</span>
  </div>
  ${rows ? `<div style="border-top:1px solid #f1f5f9;padding-top:2px">${rows}</div>` : ""}
</div>`.trim();
}

/** 3D bar cell — just the count */
function htmlBar(count: number): string {
  return `<div style="font-family:system-ui,sans-serif">
  <span style="font-size:15px;font-weight:800;color:#1e293b">${count}</span>
  <span style="font-size:10px;color:#94a3b8;margin-left:5px">datos en celda</span>
</div>`.trim();
}

/** Agent — name + status dot + count */
function htmlAgent(name: string, status: string, formsCount: number): string {
  const COLOR: Record<string, string> = {
    connected: "#0d9488",
    idle:      "#d97706",
    inactive:  "#94a3b8",
  };
  const LABEL: Record<string, string> = {
    connected: "En línea",
    idle:      "Inactivo",
    inactive:  "Sin señal",
  };
  const c = COLOR[status] ?? COLOR.inactive;
  const l = LABEL[status] ?? LABEL.inactive;

  return `<div style="font-family:system-ui,sans-serif;display:flex;align-items:center;gap:8px">
  <div style="width:8px;height:8px;border-radius:50%;background:${c};flex-shrink:0"></div>
  <div>
    <div style="font-size:12px;font-weight:700;color:#1e293b;line-height:1.3">${name}</div>
    <div style="display:flex;align-items:center;gap:5px;margin-top:1px">
      <span style="font-size:10px;color:${c};font-weight:600">${l}</span>
      <span style="font-size:10px;color:#cbd5e1">·</span>
      <span style="font-size:10px;color:#64748b">${formsCount} datos</span>
    </div>
  </div>
</div>`.trim();
}

// ─── Layer sets ───────────────────────────────────────────────────────────────

const FORM_LAYERS  = new Set(["forms-points","forms-clusters","forms-cluster-ring","forms-bars-3d","forms-bars-outline"]);
const AGENT_LAYERS = new Set(["agents-circles","agents-selected-ring"]);

// ─── Types ────────────────────────────────────────────────────────────────────

type TooltipState = {
  x: number;
  y: number;
  currentId: string | null;
  rafPending: boolean;
  pinned: boolean;
};

type RankEntry = { name: string; count: number };

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFormTooltip(
  isZoomingRef: RefObject<boolean>,
  mapRef: RefObject<MapRef | null>,
) {
  const tooltipRef    = useRef<HTMLDivElement | null>(null);
  const clusterCache  = useRef<Map<number, RankEntry[]>>(new Map());
  const state         = useRef<TooltipState>({ x: 0, y: 0, currentId: null, rafPending: false, pinned: false });

  const flushPosition = useCallback(() => {
    const el = tooltipRef.current;
    const s  = state.current;
    s.rafPending = false;
    if (!el) return;
    el.style.transform = `translate(${s.x + OFFSET_X}px, ${s.y + OFFSET_Y}px)`;
  }, []);

  const scheduleFlush = useCallback(() => {
    if (!state.current.rafPending) {
      state.current.rafPending = true;
      requestAnimationFrame(flushPosition);
    }
  }, [flushPosition]);

  const hide = useCallback(() => {
    const el = tooltipRef.current;
    if (el && state.current.currentId !== null) {
      el.style.opacity = "0";
      state.current.currentId = null;
      state.current.pinned = false;
    }
  }, []);

  /** Render cluster tooltip immediately, then async-enrich with ranking */
  const renderCluster = useCallback((el: HTMLDivElement, clusterId: number, count: number) => {
    const cached = clusterCache.current.get(clusterId);
    el.innerHTML = htmlCluster(count, cached);

    if (cached) return; // already have ranking

    const map    = mapRef.current?.getMap();
    const source = map?.getSource("forms-clustered") as GeoJSONSource | undefined;
    if (!source || typeof source.getClusterLeaves !== "function") return;

    source.getClusterLeaves(clusterId, MAX_LEAVES, 0).then((leaves) => {
      const counts = new Map<string, number>();
      for (const leaf of leaves) {
        const enc = String(leaf.properties?.encuestador ?? "").trim();
        if (enc) counts.set(enc, (counts.get(enc) ?? 0) + 1);
      }
      const ranking = Array.from(counts.entries())
        .map(([name, c]) => ({ name: name.split(" ")[0], count: c }))
        .sort((a, b) => b.count - a.count);

      clusterCache.current.set(clusterId, ranking);
      if (clusterCache.current.size > 50) {
        const first = clusterCache.current.keys().next().value;
        if (first !== undefined) clusterCache.current.delete(first);
      }

      // Only update if still hovering the same cluster
      if (state.current.currentId !== `cluster-${clusterId}`) return;
      el.innerHTML = htmlCluster(count, ranking);
    }).catch(() => {});
  }, [mapRef]);

  const onMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const el = tooltipRef.current;
    if (!el) return;

    if (isZoomingRef.current) { hide(); return; }

    const f       = e.features?.[0];
    const layerId = f?.layer?.id ?? "";

    const isFormLayer  = FORM_LAYERS.has(layerId);
    const isAgentLayer = AGENT_LAYERS.has(layerId);

    if (!isFormLayer && !isAgentLayer) {
      if (state.current.pinned) return;
      if (state.current.currentId !== null) hide();
      return;
    }

    if (!f?.properties) return;
    const p = f.properties;

    // ─── Agent ───
    if (isAgentLayer) {
      const id = `agent-${p.agent_id}`;
      if (id !== state.current.currentId) {
        state.current.currentId = id;
        state.current.pinned = false;
        el.innerHTML = htmlAgent(String(p.name ?? "Agente"), String(p.status ?? "inactive"), Number(p.forms_count ?? 0));
        el.style.opacity = "1";
      }
      state.current.x = e.point.x;
      state.current.y = e.point.y;
      scheduleFlush();
      return;
    }

    // ─── Form layers ───
    const isCluster = layerId === "forms-clusters" || layerId === "forms-cluster-ring";
    const isBar     = layerId === "forms-bars-3d"  || layerId === "forms-bars-outline";

    const featureId = isCluster
      ? `cluster-${p.cluster_id}`
      : isBar
        ? `bar-${p.count}-${p.height ?? ""}`
        : `pt-${p.nombre}-${p.created_at}`;

    if (featureId !== state.current.currentId) {
      state.current.currentId = featureId;
      state.current.pinned = false;

      if (isCluster) {
        renderCluster(el, Number(p.cluster_id), Number(p.point_count ?? 0));
      } else if (isBar) {
        el.innerHTML = htmlBar(Number(p.count ?? 0));
      } else {
        el.innerHTML = htmlFormPoint(
          String(p.nombre ?? ""),
          String(p.telefono ?? ""),
          String(p.encuestador ?? ""),
          String(p.created_at ?? ""),
        );
      }
      el.style.opacity = "1";
    }

    state.current.x = e.point.x;
    state.current.y = e.point.y;
    scheduleFlush();
  }, [isZoomingRef, hide, renderCluster, scheduleFlush]);

  const onMouseLeave = useCallback(() => {
    if (!state.current.pinned) hide();
  }, [hide]);

  /**
   * Show a pinned tooltip at a lng/lat after flyTo from datos.
   * Stays visible until user hovers a different feature.
   */
  const showPinnedTooltip = useCallback((data: PinnedTooltipData) => {
    const el  = tooltipRef.current;
    const map = mapRef.current;
    if (!el || !map) return;

    const show = () => {
      const m = mapRef.current;
      if (!m || !tooltipRef.current) return;
      const point = m.project([data.lng, data.lat]);
      state.current.currentId = `pinned-${data.nombre}-${data.created_at}`;
      state.current.pinned = true;
      state.current.x = point.x;
      state.current.y = point.y;
      tooltipRef.current.innerHTML = htmlFormPoint(data.nombre || "—", data.telefono, data.encuestador, data.created_at);
      tooltipRef.current.style.opacity = "1";
      tooltipRef.current.style.transform = `translate(${point.x + OFFSET_X}px, ${point.y + OFFSET_Y}px)`;
    };

    setTimeout(show, 750); // after flyTo animation (600ms) + buffer
  }, [mapRef]);

  return { formTooltipRef: tooltipRef, onFormMouseMove: onMouseMove, onFormMouseLeave: onMouseLeave, showPinnedTooltip } as const;
}

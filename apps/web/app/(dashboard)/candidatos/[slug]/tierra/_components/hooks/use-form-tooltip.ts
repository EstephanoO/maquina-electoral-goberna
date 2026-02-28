/**
 * useFormTooltip — Glassmorphism tooltip for form data points, clusters, and agents.
 *
 * Architecture (zero React re-renders):
 * - Direct DOM manipulation via refs
 * - requestAnimationFrame coalesces position updates
 * - Content only updates when hovered feature changes
 *
 * Clusters use getClusterLeaves() to build a mini-ranking by encuestador.
 * Results are cached per cluster_id to avoid repeated async calls on re-hover.
 *
 * Pinned tooltip: showPinnedTooltip() projects a lng/lat to screen coordinates
 * and displays a tooltip that persists until user hovers another feature.
 *
 * Agent tooltip: shows agent name, status, and forms count on hover.
 */

import { useCallback, useRef, type RefObject } from "react";
import type { MapRef, MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type { GeoJSONSource } from "maplibre-gl";
import type { PinnedTooltipData } from "../types";

/* ─── Types ─── */

type TooltipState = {
  x: number;
  y: number;
  currentId: string | null;
  rafPending: boolean;
  /** Whether the tooltip is pinned (from datos "ver en mapa"). Cleared on next real hover. */
  pinned: boolean;
};

type RankEntry = { name: string; count: number };

const OFFSET_X = 14;
const OFFSET_Y = -12;
const MAX_LEAVES = 200;
const MAX_RANKING = 3;
const MEDAL = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

/* ─── Helpers ─── */

/** "2026-02-15T03:42:00Z" → "15 feb · 03:42" */
function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    const M = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${d.getDate()} ${M[d.getMonth()]} \u00b7 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return iso; }
}

/** "987654321" → "987 654 321" */
function fmtPhone(tel: string): string {
  const c = tel.replace(/\D/g, "");
  if (c.length === 9) return `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6)}`;
  if (c.length === 10) return `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6)}`;
  return tel;
}

/** Build mini-ranking HTML rows from cluster leaves */
function rankingHtml(entries: RankEntry[]): string {
  return entries.slice(0, MAX_RANKING).map((e, i) =>
    `<div style="display:flex;align-items:center;gap:5px;padding:1px 0">` +
      `<span style="font-size:10px;width:16px;text-align:center">${MEDAL[i] ?? `${i + 1}.`}</span>` +
      `<span style="font-size:10px;color:#334155;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.name}</span>` +
      `<span style="font-size:10px;color:#2563eb;font-weight:700;font-variant-numeric:tabular-nums">${e.count}</span>` +
    `</div>`,
  ).join("");
}

/** Render form point HTML */
function renderFormPoint(nombre: string, telefono: string, encuestador: string, createdAt: string): string {
  return (
    `<div style="font-weight:700;font-size:12px;color:#1e293b;line-height:1.3;margin-bottom:2px">${nombre}</div>` +
    (telefono
      ? `<div style="font-size:11px;color:#475569;line-height:1.3;letter-spacing:0.3px;font-variant-numeric:tabular-nums">${fmtPhone(telefono)}</div>`
      : "") +
    `<div style="display:flex;align-items:center;gap:6px;margin-top:4px;padding-top:4px;border-top:1px solid rgba(148,163,184,0.15)">` +
      (encuestador ? `<span style="font-size:10px;color:#64748b;font-weight:500">${encuestador.split(" ")[0]}</span>` : "") +
      (createdAt ? `<span style="font-size:9px;color:#94a3b8;margin-left:auto">${fmtDate(createdAt)}</span>` : "") +
    `</div>`
  );
}

/** Layers that trigger tooltip */
const FORM_LAYERS = new Set(["forms-points", "forms-clusters", "forms-cluster-ring"]);
const AGENT_LAYERS = new Set(["agents-circles", "agents-selected-ring"]);

/** Agent status display config */
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  connected: { label: "Conectado", color: "#0d9488" },
  idle: { label: "Inactivo", color: "#d97706" },
  inactive: { label: "Sin se\u00f1al", color: "#64748b" },
};

/* ─── Hook ─── */

export function useFormTooltip(
  isZoomingRef: RefObject<boolean>,
  mapRef: RefObject<MapRef | null>,
) {
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const clusterCache = useRef<Map<number, RankEntry[]>>(new Map());

  const state = useRef<TooltipState>({
    x: 0, y: 0, currentId: null, rafPending: false, pinned: false,
  });

  const flushPosition = useCallback(() => {
    const el = tooltipRef.current;
    const s = state.current;
    s.rafPending = false;
    if (!el) return;
    el.style.transform = `translate(${s.x + OFFSET_X}px, ${s.y + OFFSET_Y}px)`;
  }, []);

  /** Render initial cluster tooltip, then async-enrich with ranking */
  const renderCluster = useCallback((el: HTMLDivElement, clusterId: number, count: number) => {
    const base =
      `<div style="display:flex;align-items:center;gap:7px;margin-bottom:1px">` +
        `<div style="width:22px;height:22px;border-radius:6px;background:#2563eb;display:flex;align-items:center;justify-content:center;flex-shrink:0">` +
          `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>` +
        `</div>` +
        `<div>` +
          `<div style="font-weight:700;font-size:13px;color:#1e293b;line-height:1.2">${count} datos</div>` +
          `<div style="font-size:9px;color:#94a3b8;line-height:1.3">Click para expandir</div>` +
        `</div>` +
      `</div>`;

    // Check cache first
    const cached = clusterCache.current.get(clusterId);
    if (cached && cached.length > 0) {
      el.innerHTML = base +
        `<div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(148,163,184,0.15)">${rankingHtml(cached)}</div>`;
      return;
    }

    // Show base immediately
    el.innerHTML = base;

    // Async: fetch cluster leaves and build ranking
    const map = mapRef.current?.getMap();
    const source = map?.getSource("forms-clustered") as GeoJSONSource | undefined;
    if (!source || typeof source.getClusterLeaves !== "function") return;

    source.getClusterLeaves(clusterId, MAX_LEAVES, 0).then((leaves) => {
      // Group by encuestador
      const counts = new Map<string, number>();
      for (const leaf of leaves) {
        const enc = String(leaf.properties?.encuestador ?? "").trim();
        if (enc) counts.set(enc, (counts.get(enc) ?? 0) + 1);
      }
      const ranking = Array.from(counts.entries())
        .map(([name, cnt]) => ({ name: name.split(" ")[0], count: cnt }))
        .sort((a, b) => b.count - a.count);

      // Cache
      clusterCache.current.set(clusterId, ranking);
      // Keep cache bounded
      if (clusterCache.current.size > 50) {
        const first = clusterCache.current.keys().next().value;
        if (first !== undefined) clusterCache.current.delete(first);
      }

      // Only update if still hovering the same cluster
      if (state.current.currentId !== `cluster-${clusterId}`) return;
      if (ranking.length === 0) return;

      el.innerHTML = base +
        `<div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(148,163,184,0.15)">${rankingHtml(ranking)}</div>`;
    }).catch(() => { /* source removed or map destroyed */ });
  }, [mapRef]);

  const onMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const el = tooltipRef.current;
    if (!el) return;

    if (isZoomingRef.current) {
      if (state.current.currentId !== null) {
        el.style.opacity = "0";
        state.current.currentId = null;
        state.current.pinned = false;
      }
      return;
    }

    const features = e.features;
    const f = features?.[0];
    const layerId = f?.layer?.id ?? "";

    // Check if hovering a form point, cluster, or agent
    const isFormLayer = FORM_LAYERS.has(layerId);
    const isAgentLayer = AGENT_LAYERS.has(layerId);

    if (!isFormLayer && !isAgentLayer) {
      // Not hovering any tooltipable feature — but if pinned, keep showing
      if (state.current.pinned) return;
      if (state.current.currentId !== null) {
        el.style.opacity = "0";
        state.current.currentId = null;
      }
      return;
    }

    if (!f?.properties) return;

    const props = f.properties;

    // ─── Agent tooltip ───
    if (isAgentLayer) {
      const agentId = `agent-${props.agent_id}`;
      if (agentId !== state.current.currentId) {
        state.current.currentId = agentId;
        state.current.pinned = false;

        const name = String(props.name ?? "Agente");
        const status = String(props.status ?? "inactive");
        const formsCount = Number(props.forms_count ?? 0);
        const cfg = STATUS_LABELS[status] ?? STATUS_LABELS.inactive;

        el.innerHTML =
          `<div style="display:flex;align-items:center;gap:8px">` +
            `<div style="width:8px;height:8px;border-radius:50%;background:${cfg.color};flex-shrink:0"></div>` +
            `<div>` +
              `<div style="font-weight:700;font-size:12px;color:#1e293b;line-height:1.3">${name}</div>` +
              `<div style="display:flex;align-items:center;gap:6px;margin-top:2px">` +
                `<span style="font-size:10px;color:${cfg.color};font-weight:600">${cfg.label}</span>` +
                `<span style="font-size:10px;color:#94a3b8">\u00b7</span>` +
                `<span style="font-size:10px;color:#64748b;font-weight:500">${formsCount} dato${formsCount !== 1 ? "s" : ""}</span>` +
              `</div>` +
            `</div>` +
          `</div>`;

        el.style.opacity = "1";
      }

      state.current.x = e.point.x;
      state.current.y = e.point.y;

      if (!state.current.rafPending) {
        state.current.rafPending = true;
        requestAnimationFrame(flushPosition);
      }
      return;
    }

    // ─── Form tooltip ───
    const isCluster = layerId === "forms-clusters" || layerId === "forms-cluster-ring";
    const featureId = isCluster
      ? `cluster-${props.cluster_id}`
      : `pt-${props.nombre}-${props.created_at}`;

    if (featureId !== state.current.currentId) {
      state.current.currentId = featureId;
      state.current.pinned = false;

      if (isCluster) {
        renderCluster(el, Number(props.cluster_id), Number(props.point_count ?? 0));
      } else {
        el.innerHTML = renderFormPoint(
          String(props.nombre ?? "\u2014"),
          String(props.telefono ?? ""),
          String(props.encuestador ?? ""),
          String(props.created_at ?? ""),
        );
      }

      el.style.opacity = "1";
    }

    state.current.x = e.point.x;
    state.current.y = e.point.y;

    if (!state.current.rafPending) {
      state.current.rafPending = true;
      requestAnimationFrame(flushPosition);
    }
  }, [isZoomingRef, flushPosition, renderCluster]);

  const onMouseLeave = useCallback(() => {
    const el = tooltipRef.current;
    // Don't hide if pinned
    if (state.current.pinned) return;
    if (el && state.current.currentId !== null) {
      el.style.opacity = "0";
      state.current.currentId = null;
    }
  }, []);

  /**
   * Show a pinned tooltip at a specific lng/lat after flyTo from datos.
   * The tooltip stays until user hovers over a different feature.
   * Called after the flyTo animation completes.
   */
  const showPinnedTooltip = useCallback((data: PinnedTooltipData) => {
    const el = tooltipRef.current;
    const map = mapRef.current;
    if (!el || !map) return;

    // Wait for the fly animation to finish, then project and show
    const show = () => {
      const m = mapRef.current;
      if (!m || !tooltipRef.current) return;

      const point = m.project([data.lng, data.lat]);
      const pinnedId = `pinned-${data.nombre}-${data.created_at}`;
      state.current.currentId = pinnedId;
      state.current.pinned = true;
      state.current.x = point.x;
      state.current.y = point.y;

      tooltipRef.current.innerHTML = renderFormPoint(
        data.nombre || "\u2014",
        data.telefono,
        data.encuestador,
        data.created_at,
      );
      tooltipRef.current.style.opacity = "1";
      tooltipRef.current.style.transform = `translate(${point.x + OFFSET_X}px, ${point.y + OFFSET_Y}px)`;
    };

    // Schedule after flyTo animation (600ms FLY_DURATION + 100ms buffer)
    setTimeout(show, 750);
  }, [mapRef]);

  return {
    formTooltipRef: tooltipRef,
    onFormMouseMove: onMouseMove,
    onFormMouseLeave: onMouseLeave,
    showPinnedTooltip,
  } as const;
}

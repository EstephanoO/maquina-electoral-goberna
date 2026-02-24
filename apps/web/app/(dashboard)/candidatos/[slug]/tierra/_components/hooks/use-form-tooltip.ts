/**
 * useFormTooltip — Glassmorphism tooltip for form data points and clusters.
 *
 * Same zero-render architecture as useZoneTooltip:
 * - Direct DOM manipulation via refs (no React state)
 * - requestAnimationFrame coalesces position updates
 * - Content only updates when hovered feature changes
 * - 60fps tracking with zero GC pressure
 *
 * Handles two cases:
 * - Individual form points → nombre, telefono, encuestador, fecha
 * - Clusters → count summary with icon
 */

import { useCallback, useRef, type RefObject } from "react";
import type { MapLayerMouseEvent } from "@vis.gl/react-maplibre";

/* ─── Types ─── */

type TooltipState = {
  x: number;
  y: number;
  currentId: string | null;
  rafPending: boolean;
};

const OFFSET_X = 14;
const OFFSET_Y = -12;

/** Format "2026-02-15T03:42:00Z" → "15 feb · 03:42" */
function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const day = d.getDate();
    const mon = months[d.getMonth()];
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${day} ${mon} · ${h}:${m}`;
  } catch {
    return iso;
  }
}

/** Format phone: "987654321" → "987 654 321" */
function fmtPhone(tel: string): string {
  const clean = tel.replace(/\D/g, "");
  if (clean.length === 9) return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  if (clean.length === 10) return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  return tel;
}

/** Layers that trigger tooltip */
const FORM_LAYERS = new Set(["forms-points", "forms-clusters", "forms-cluster-ring"]);

/* ─── Hook ─── */

export function useFormTooltip(isZoomingRef: RefObject<boolean>) {
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const state = useRef<TooltipState>({
    x: 0,
    y: 0,
    currentId: null,
    rafPending: false,
  });

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
      if (state.current.currentId !== null) {
        el.style.opacity = "0";
        state.current.currentId = null;
      }
      return;
    }

    const features = e.features;
    const f = features?.[0];
    const layerId = f?.layer?.id ?? "";

    if (!FORM_LAYERS.has(layerId) || !f?.properties) {
      if (state.current.currentId !== null) {
        el.style.opacity = "0";
        state.current.currentId = null;
      }
      return;
    }

    const props = f.properties;
    const isCluster = layerId === "forms-clusters" || layerId === "forms-cluster-ring";

    const featureId = isCluster
      ? `cluster-${props.cluster_id}`
      : `pt-${props.nombre}-${props.created_at}`;

    if (featureId !== state.current.currentId) {
      state.current.currentId = featureId;

      if (isCluster) {
        const count = Number(props.point_count ?? 0);
        el.innerHTML =
          `<div style="display:flex;align-items:center;gap:6px">` +
            `<div style="width:22px;height:22px;border-radius:6px;background:#2563eb;display:flex;align-items:center;justify-content:center">` +
              `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>` +
            `</div>` +
            `<div>` +
              `<div style="font-weight:700;font-size:13px;color:#1e293b;line-height:1.2">${count} datos</div>` +
              `<div style="font-size:9px;color:#94a3b8;line-height:1.3">Click para expandir</div>` +
            `</div>` +
          `</div>`;
      } else {
        const nombre = String(props.nombre ?? "—");
        const telefono = String(props.telefono ?? "");
        const encuestador = String(props.encuestador ?? "");
        const createdAt = String(props.created_at ?? "");

        el.innerHTML =
          `<div style="font-weight:700;font-size:12px;color:#1e293b;line-height:1.3;margin-bottom:2px">${nombre}</div>` +
          (telefono
            ? `<div style="font-size:11px;color:#475569;line-height:1.3;letter-spacing:0.3px;font-variant-numeric:tabular-nums">${fmtPhone(telefono)}</div>`
            : "") +
          `<div style="display:flex;align-items:center;gap:6px;margin-top:4px;padding-top:4px;border-top:1px solid rgba(148,163,184,0.15)">` +
            (encuestador ? `<span style="font-size:10px;color:#64748b;font-weight:500">${encuestador.split(" ")[0]}</span>` : "") +
            (createdAt ? `<span style="font-size:9px;color:#94a3b8;margin-left:auto">${fmtDate(createdAt)}</span>` : "") +
          `</div>`;
      }

      el.style.opacity = "1";
    }

    state.current.x = e.point.x;
    state.current.y = e.point.y;

    if (!state.current.rafPending) {
      state.current.rafPending = true;
      requestAnimationFrame(flushPosition);
    }
  }, [isZoomingRef, flushPosition]);

  const onMouseLeave = useCallback(() => {
    const el = tooltipRef.current;
    if (el && state.current.currentId !== null) {
      el.style.opacity = "0";
      state.current.currentId = null;
    }
  }, []);

  return { formTooltipRef: tooltipRef, onFormMouseMove: onMouseMove, onFormMouseLeave: onMouseLeave } as const;
}

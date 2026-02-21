/* ========== Map Resize Observer — recalibrate + re-fit when panels change container ========== */

import { useCallback, useRef } from "react";
import type { MapRef } from "@vis.gl/react-maplibre";
import type { DrillState } from "../types";
import { PERU_BOUNDS, RESIZE_FLY_DURATION } from "../constants";
import { getDepartamentos, getProvincias, getDistritos } from "@/lib/services/geo";

/**
 * Returns a `containerRef` callback-ref that attaches a ResizeObserver.
 * On significant size changes (>50px), triggers map.resize() and re-fits
 * bounds to match the current drill level.
 */
export function useMapResize(
  mapRef: React.RefObject<MapRef | null>,
  drillStateRef: React.RefObject<DrillState>,
) {
  const roRef = useRef<ResizeObserver | null>(null);
  const roTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roPrevSize = useRef({ w: 0, h: 0 });

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (roTimerRef.current) { clearTimeout(roTimerRef.current); roTimerRef.current = null; }
    if (!node) return;

    roPrevSize.current = { w: node.clientWidth, h: node.clientHeight };

    roRef.current = new ResizeObserver(() => {
      if (roTimerRef.current) clearTimeout(roTimerRef.current);
      roTimerRef.current = setTimeout(() => {
        const map = mapRef.current;
        if (!map || !node) return;
        const w = node.clientWidth;
        const h = node.clientHeight;
        const dw = Math.abs(w - roPrevSize.current.w);
        const dh = Math.abs(h - roPrevSize.current.h);
        roPrevSize.current = { w, h };

        map.resize();

        if (dw > 50 || dh > 50) {
          const drill = drillStateRef.current!;
          if (drill.level === 0) {
            map.fitBounds(PERU_BOUNDS, { padding: 30, duration: RESIZE_FLY_DURATION });
          } else if (drill.level >= 3 && drill.provCode && drill.distCode) {
            getDistritos(drill.provCode).then((r) => {
              if (!r.ok || !r.distritos || !mapRef.current) return;
              const d = r.distritos.find((x) => x.ubigeo === drill.distCode);
              if (d) mapRef.current.fitBounds(d.bounds, { padding: 40, duration: RESIZE_FLY_DURATION });
            }).catch(() => {});
          } else if (drill.level === 2 && drill.depCode && drill.provCode) {
            getProvincias(drill.depCode).then((r) => {
              if (!r.ok || !r.provincias || !mapRef.current) return;
              const p = r.provincias.find((x) => x.codprov_full === drill.provCode);
              if (p) mapRef.current.fitBounds(p.bounds, { padding: 40, duration: RESIZE_FLY_DURATION });
            }).catch(() => {});
          } else if (drill.level === 1 && drill.depCode) {
            getDepartamentos().then((r) => {
              if (!r.ok || !r.departamentos || !mapRef.current) return;
              const dep = r.departamentos.find((x) => x.coddep === drill.depCode);
              if (dep) mapRef.current.fitBounds(dep.bounds, { padding: 40, duration: RESIZE_FLY_DURATION });
            }).catch(() => {});
          } else {
            map.fitBounds(PERU_BOUNDS, { padding: 30, duration: RESIZE_FLY_DURATION });
          }
        }
      }, 350);
    });
    roRef.current.observe(node);
  }, [mapRef, drillStateRef]);

  return containerRef;
}

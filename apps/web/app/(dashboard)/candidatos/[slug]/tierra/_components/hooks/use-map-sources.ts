"use client";

/**
 * useMapSources — memoized GeoJSON FeatureCollections for all map layers.
 *
 * All geographic overlays (priority zones, sectors, subsectors) are now served
 * as vector tiles from Tegola. This module only handles dynamic data layers:
 * agents and form submissions.
 */

import { useMemo } from "react";
import type { EnrichedAgent, FormPoint } from "../types";

const NEON_COLORS = ["#34f5a4", "#ff9f43"] as const;
const NEON_GLOW_COLORS = ["rgba(52,245,164,0.45)", "rgba(255,159,67,0.45)"] as const;

function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

/* ─── Agent source ─── */

export function useAgentsSource(agents: EnrichedAgent[], selectedAgentId: string | null) {
  const visibleAgents = selectedAgentId
    ? agents.filter((a) => a.id === selectedAgentId)
    : agents;

  return useMemo(() => ({
    type: "FeatureCollection" as const,
    features: visibleAgents.map((a) => ({
      type: "Feature" as const,
      properties: {
        agent_id: a.id,
        name: a.name,
        status: a.status,
        forms_count: a.forms_count,
        is_selected: a.id === selectedAgentId ? 1 : 0,
      },
      geometry: { type: "Point" as const, coordinates: [a.lng, a.lat] },
    })),
  }), [visibleAgents, selectedAgentId]);
}

/* ─── Form sources (clustered) ─── */

export function useFormSources(forms: FormPoint[], selectedAgentId: string | null, barsZoom = 8) {
  const MIN_BAR_HEIGHT = 140;
  const MAX_BAR_HEIGHT = 2600;

  // Dynamic grid: zoom in => smaller cells (bars split), zoom out => larger cells (bars merge).
  const barsGridSizeDeg = useMemo(() => {
    const z = Math.max(4, Math.min(17, barsZoom));
    const size = 0.45 / Math.pow(2, z - 5);
    return Math.max(0.0025, Math.min(0.8, size));
  }, [barsZoom]);

  // Base filtered forms — only valid coordinates
  const validForms = useMemo(
    () => forms.filter((f) => f.lat && f.lng && !isNaN(f.lat) && !isNaN(f.lng)),
    [forms],
  );

  // When an agent is selected, only include that agent's points.
  // This makes clusters re-compute with only filtered data (correct counts).
  const visibleForms = useMemo(
    () => selectedAgentId
      ? validForms.filter((f) => f.agent_id === selectedAgentId)
      : validForms,
    [validForms, selectedAgentId],
  );

  const formsGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: visibleForms.map((f) => {
      const colorKey = `${f.agent_id ?? ""}:${f.encuestador ?? ""}:${f.telefono ?? ""}`;
      const idx = stableHash(colorKey) % NEON_COLORS.length;
      return {
        type: "Feature" as const,
        properties: {
          nombre: f.nombre,
          telefono: f.telefono ?? "",
          encuestador: f.encuestador ?? "",
          agent_id: f.agent_id ?? "",
          created_at: f.created_at,
          point_color: NEON_COLORS[idx],
          point_glow: NEON_GLOW_COLORS[idx],
        },
        geometry: { type: "Point" as const, coordinates: [f.lng, f.lat] },
      };
    }),
  }), [visibleForms]);

  const barsGeoJson = useMemo(() => {
    type GridCell = { lngIndex: number; latIndex: number; count: number };
    const grid = new Map<string, GridCell>();

    for (const f of visibleForms) {
      const lngIndex = Math.floor(f.lng / barsGridSizeDeg);
      const latIndex = Math.floor(f.lat / barsGridSizeDeg);
      const key = `${lngIndex}:${latIndex}`;
      const prev = grid.get(key);
      if (prev) prev.count += 1;
      else grid.set(key, { lngIndex, latIndex, count: 1 });
    }

    return {
      type: "FeatureCollection" as const,
      features: Array.from(grid.values()).map((cell) => {
        const lng0 = cell.lngIndex * barsGridSizeDeg;
        const lat0 = cell.latIndex * barsGridSizeDeg;
        const lng1 = lng0 + barsGridSizeDeg;
        const lat1 = lat0 + barsGridSizeDeg;
        const height = Math.min(MAX_BAR_HEIGHT, Math.max(MIN_BAR_HEIGHT, Math.round(Math.sqrt(cell.count) * 280)));

        return {
          type: "Feature" as const,
          properties: {
            count: cell.count,
            height,
          },
          geometry: {
            type: "Polygon" as const,
            coordinates: [[
              [lng0, lat0],
              [lng1, lat0],
              [lng1, lat1],
              [lng0, lat1],
              [lng0, lat0],
            ]],
          },
        };
      }),
    };
  }, [visibleForms, barsGridSizeDeg]);

  return { formsGeoJson, barsGeoJson };
}

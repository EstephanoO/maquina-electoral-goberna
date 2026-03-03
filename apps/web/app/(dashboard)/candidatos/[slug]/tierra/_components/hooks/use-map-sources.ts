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

/* ─── Agent source ─── */

export function useAgentsSource(agents: EnrichedAgent[], selectedAgentId: string | null) {
  return useMemo(() => ({
    type: "FeatureCollection" as const,
    features: agents.map((a) => ({
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
  }), [agents, selectedAgentId]);
}

/* ─── Form sources (clustered) ─── */

export function useFormSources(forms: FormPoint[], selectedAgentId: string | null) {
  const GRID_SIZE_DEG = 0.015;
  const MIN_BAR_HEIGHT = 140;
  const MAX_BAR_HEIGHT = 2600;

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
    features: visibleForms.map((f) => ({
      type: "Feature" as const,
      properties: {
        nombre: f.nombre,
        telefono: f.telefono ?? "",
        encuestador: f.encuestador ?? "",
        agent_id: f.agent_id ?? "",
        created_at: f.created_at,
      },
      geometry: { type: "Point" as const, coordinates: [f.lng, f.lat] },
    })),
  }), [visibleForms]);

  const barsGeoJson = useMemo(() => {
    type GridCell = { lngIndex: number; latIndex: number; count: number };
    const grid = new Map<string, GridCell>();

    for (const f of visibleForms) {
      const lngIndex = Math.floor(f.lng / GRID_SIZE_DEG);
      const latIndex = Math.floor(f.lat / GRID_SIZE_DEG);
      const key = `${lngIndex}:${latIndex}`;
      const prev = grid.get(key);
      if (prev) prev.count += 1;
      else grid.set(key, { lngIndex, latIndex, count: 1 });
    }

    return {
      type: "FeatureCollection" as const,
      features: Array.from(grid.values()).map((cell) => {
        const lng0 = cell.lngIndex * GRID_SIZE_DEG;
        const lat0 = cell.latIndex * GRID_SIZE_DEG;
        const lng1 = lng0 + GRID_SIZE_DEG;
        const lat1 = lat0 + GRID_SIZE_DEG;
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
  }, [visibleForms]);

  return { formsGeoJson, barsGeoJson };
}


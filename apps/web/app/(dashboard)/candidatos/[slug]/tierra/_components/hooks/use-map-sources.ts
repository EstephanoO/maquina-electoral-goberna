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

/* ─── Form sources (clustered + heatmap) ─── */

type FormSources = {
  formsGeoJson: GeoJSON.FeatureCollection;
  formsHeatGeoJson: GeoJSON.FeatureCollection;
};

export function useFormSources(forms: FormPoint[], selectedAgentId: string | null): FormSources {
  // Base filtered forms — only valid coordinates
  const validForms = useMemo(
    () => forms.filter((f) => f.lat && f.lng && !isNaN(f.lat) && !isNaN(f.lng)),
    [forms],
  );

  const formsGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: validForms.map((f) => ({
      type: "Feature" as const,
      properties: {
        nombre: f.nombre,
        agent_id: f.agent_id ?? "",
        created_at: f.created_at,
        is_filtered: selectedAgentId ? (f.agent_id === selectedAgentId ? 1 : 0) : 1,
      },
      geometry: { type: "Point" as const, coordinates: [f.lng, f.lat] },
    })),
  }), [validForms, selectedAgentId]);

  // Heatmap: derive from validForms (not re-iterate raw forms)
  // Only depends on forms, NOT selectedAgentId — stable when selection changes
  const formsHeatGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: validForms.map((f) => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "Point" as const, coordinates: [f.lng, f.lat] },
    })),
  }), [validForms]);

  return { formsGeoJson, formsHeatGeoJson };
}



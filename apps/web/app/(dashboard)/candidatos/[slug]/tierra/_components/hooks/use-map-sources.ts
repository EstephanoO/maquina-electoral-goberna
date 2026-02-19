"use client";

/**
 * useMapSources — memoized GeoJSON FeatureCollections for all map layers.
 *
 * Fixes from original:
 * - formsHeatGeoJson now derives from formsGeoJson (no double iteration)
 * - GeoJSON fallback layers are memoized (were raw .filter() in JSX)
 * - Filtered geo data only recomputes when its specific deps change
 */

import { useMemo } from "react";
import type { EnrichedAgent, FormPoint, DrillState, GeoDataState } from "../types";

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

/* ─── GeoJSON fallback filtered sources ─── */
// These were raw .filter() calls in JSX — now properly memoized.

export type FilteredGeoSources = {
  geoDepData: GeoJSON.FeatureCollection | null;
  geoProvData: GeoJSON.FeatureCollection | null;
  geoDistData: GeoJSON.FeatureCollection | null;
  geoSectorData: GeoJSON.FeatureCollection | null;
  geoSubsectorData: GeoJSON.FeatureCollection | null;
};

export function useFilteredGeoSources(
  geoData: GeoDataState,
  drillState: DrillState,
): FilteredGeoSources {
  // dep: only at level 0
  const geoDepData = useMemo(() => {
    if (!geoData.dep || drillState.level !== 0) return null;
    return geoData.dep;
  }, [geoData.dep, drillState.level]);

  // prov: only at level 1, filtered by depCode
  const geoProvData = useMemo(() => {
    if (!geoData.prov || drillState.level !== 1 || !drillState.depCode) return null;
    const filtered = geoData.prov.features.filter(
      (f) => f.properties?.coddep === drillState.depCode,
    );
    if (filtered.length === 0) return null;
    return { ...geoData.prov, features: filtered };
  }, [geoData.prov, drillState.level, drillState.depCode]);

  // dist: level 0 (as top-level fallback) or level 2
  const geoDistData = useMemo(() => {
    if (!geoData.dist) return null;

    let filtered: GeoJSON.Feature[] = [];
    if (drillState.level === 0 && !geoData.dep && !geoData.prov) {
      // No higher-level GeoJSON, show dists as top level
      filtered = geoData.dist.features;
    } else if (drillState.level === 2 && drillState.provCode) {
      filtered = geoData.dist.features.filter(
        (f) => f.properties?.codprov_full === drillState.provCode,
      );
    }

    if (filtered.length === 0) return null;
    return { ...geoData.dist, features: filtered };
  }, [geoData.dist, geoData.dep, geoData.prov, drillState.level, drillState.provCode]);

  // sector: level 3+
  const geoSectorData = useMemo(() => {
    if (!geoData.sector || drillState.level < 3 || !drillState.distCode) return null;
    const filtered = geoData.sector.features.filter(
      (f) => f.properties?.ubigeo === drillState.distCode,
    );
    if (filtered.length === 0) return null;
    return { ...geoData.sector, features: filtered };
  }, [geoData.sector, drillState.level, drillState.distCode]);

  // subsector: level 4+
  const geoSubsectorData = useMemo(() => {
    if (!geoData.subsector || drillState.level < 4 || !drillState.distCode || drillState.sector == null) return null;
    const filtered = geoData.subsector.features.filter(
      (f) => f.properties?.ubigeo === drillState.distCode && f.properties?.sector === drillState.sector,
    );
    if (filtered.length === 0) return null;
    return { ...geoData.subsector, features: filtered };
  }, [geoData.subsector, drillState.level, drillState.distCode, drillState.sector]);

  return { geoDepData, geoProvData, geoDistData, geoSectorData, geoSubsectorData };
}

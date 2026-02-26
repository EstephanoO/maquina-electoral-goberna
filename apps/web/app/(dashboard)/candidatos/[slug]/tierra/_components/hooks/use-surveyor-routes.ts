"use client";

/**
 * useSurveyorRoutes — generates LineString GeoJSON per surveyor (encuestador).
 *
 * Groups FormPoints by `encuestador`, sorts each group by `created_at`,
 * and produces a FeatureCollection of LineStrings connecting the submission
 * locations in chronological order. Each feature also carries a `point_count`
 * and a stable color derived from a deterministic hash of the surveyor name.
 *
 * Additionally, produces a FeatureCollection of Points at each vertex so we
 * can render directional arrows or numbered waypoints along the route.
 */

import { useMemo } from "react";
import type { FormPoint } from "../types";

/* ─── Route palette (12 distinct, colorblind-friendly-ish colors) ─── */

const ROUTE_PALETTE = [
  "#e63946", // red
  "#457b9d", // steel blue
  "#2a9d8f", // teal
  "#e9c46a", // gold
  "#f4a261", // sandy
  "#264653", // dark teal
  "#6a4c93", // purple
  "#1982c4", // blue
  "#8ac926", // lime
  "#ff595e", // salmon
  "#6d6875", // mauve
  "#06d6a0", // mint
] as const;

/** Deterministic hash → palette index for a surveyor name */
function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return ROUTE_PALETTE[Math.abs(hash) % ROUTE_PALETTE.length];
}

/* ─── Types ─── */

export type SurveyorRouteMeta = {
  name: string;
  color: string;
  pointCount: number;
};

/* ─── Hook ─── */

export function useSurveyorRoutes(
  forms: FormPoint[],
  selectedAgentId: string | null,
) {
  return useMemo(() => {
    // Only valid, geolocated forms with a known encuestador
    const valid = forms.filter(
      (f) => f.lat && f.lng && !isNaN(f.lat) && !isNaN(f.lng) && f.encuestador,
    );

    // When an agent is selected, filter to that agent's forms only
    const filtered = selectedAgentId
      ? valid.filter((f) => f.agent_id === selectedAgentId)
      : valid;

    // Group by encuestador name
    const groups = new Map<string, FormPoint[]>();
    for (const f of filtered) {
      const key = f.encuestador;
      const arr = groups.get(key);
      if (arr) arr.push(f);
      else groups.set(key, [f]);
    }

    // Build LineString features (sorted by created_at) + point features for waypoints
    const lineFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    const waypointFeatures: GeoJSON.Feature<GeoJSON.Point>[] = [];
    const meta: SurveyorRouteMeta[] = [];

    for (const [name, pts] of groups) {
      // Need at least 2 points to draw a line
      if (pts.length < 2) continue;

      const sorted = pts.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );

      const color = nameToColor(name);
      const coordinates = sorted.map((p) => [p.lng, p.lat] as [number, number]);

      lineFeatures.push({
        type: "Feature",
        properties: {
          encuestador: name,
          color,
          point_count: sorted.length,
        },
        geometry: { type: "LineString", coordinates },
      });

      // Waypoints: first point gets seq=1, last gets the total
      sorted.forEach((p, idx) => {
        waypointFeatures.push({
          type: "Feature",
          properties: {
            encuestador: name,
            color,
            seq: idx + 1,
            total: sorted.length,
            is_first: idx === 0 ? 1 : 0,
            is_last: idx === sorted.length - 1 ? 1 : 0,
            nombre: p.nombre,
            created_at: p.created_at,
          },
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        });
      });

      meta.push({ name, color, pointCount: sorted.length });
    }

    const routesGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: "FeatureCollection",
      features: lineFeatures,
    };

    const waypointsGeoJson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: "FeatureCollection",
      features: waypointFeatures,
    };

    return { routesGeoJson, waypointsGeoJson, surveyorMeta: meta };
  }, [forms, selectedAgentId]);
}

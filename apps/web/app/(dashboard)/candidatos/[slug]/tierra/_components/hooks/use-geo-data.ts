"use client";

/**
 * useGeoData — loads campaign-specific GeoJSON fallback files.
 *
 * Fixes from original:
 * - Uses Promise.all to batch all fetches → single setState instead of N setStates
 * - Normalizes properties once at load time
 * - Stable state reference when slug doesn't change
 */

import { useEffect, useState } from "react";
import type { GeoDataState, GeoLevel } from "../types";
import { GEOJSON_FILES } from "../constants";
import { normalizeFeatureProperties } from "../utils";

const EMPTY_GEO_DATA: GeoDataState = {
  dep: null, prov: null, dist: null, sector: null, subsector: null,
};

export function useGeoData(slug: string): GeoDataState {
  const [geoData, setGeoData] = useState<GeoDataState>(EMPTY_GEO_DATA);

  useEffect(() => {
    const configs = GEOJSON_FILES[slug];
    if (!configs || configs.length === 0) return;

    let cancelled = false;

    // Fetch all in parallel, single setState
    const promises = configs.map(async (cfg) => {
      try {
        const r = await fetch(cfg.file);
        const fc: GeoJSON.FeatureCollection = await r.json();
        return { level: cfg.level, data: normalizeFeatureProperties(fc) };
      } catch {
        return null; // file not found, ignore
      }
    });

    Promise.all(promises).then((results) => {
      if (cancelled) return;

      const merged: GeoDataState = { ...EMPTY_GEO_DATA };
      for (const result of results) {
        if (result) merged[result.level] = result.data;
      }
      setGeoData(merged);
    });

    return () => { cancelled = true; };
  }, [slug]);

  return geoData;
}

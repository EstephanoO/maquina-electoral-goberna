/**
 * resolveDrillBounds — pure async helper that resolves the bounding box
 * for any DrillState level by querying the geo hierarchy cache.
 *
 * Used by both useDrillBounds/useDrillRegion (for data filtering) and
 * useAutoFit (for map camera positioning).
 *
 * Returns null at level 0 (Peru overview = no bounds restriction).
 *
 * NOTE: Polygon geometry is fetched separately in useDrillRegion (two-phase)
 * so that bounds resolve instantly (cached) while geometry loads in background.
 */

import type { GeoBounds } from "@/lib/services/geo";
import { getDepartamentos, getProvincias, getDistritos } from "@/lib/services/geo";
import type { DrillState } from "../types";

export type DrillRegion = {
  bounds: GeoBounds;
  geometry: GeoJSON.Geometry | null;
};

export async function resolveDrillBounds(drillState: DrillState): Promise<GeoBounds | null> {
  if (drillState.level === 0) return null;

  if (drillState.level === 1 && drillState.depCode) {
    const res = await getDepartamentos();
    if (!res.ok || !res.departamentos) return null;
    return res.departamentos.find((d) => d.coddep === drillState.depCode)?.bounds ?? null;
  }

  if (drillState.level === 2 && drillState.depCode && drillState.provCode) {
    const res = await getProvincias(drillState.depCode);
    if (!res.ok || !res.provincias) return null;
    return res.provincias.find((p) => p.codprov_full === drillState.provCode)?.bounds ?? null;
  }

  if (drillState.level >= 3 && drillState.provCode && drillState.distCode) {
    const res = await getDistritos(drillState.provCode);
    if (!res.ok || !res.distritos) return null;
    return res.distritos.find((d) => d.ubigeo === drillState.distCode)?.bounds ?? null;
  }

  return null;
}

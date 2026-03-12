/**
 * resolveDrillBounds — pure async helper that resolves the bounding box
 * AND polygon geometry for any DrillState level by querying the geo hierarchy cache.
 *
 * Used by both useDrillBounds (for data filtering) and useAutoFit
 * (for map camera positioning). Single place to change if the geo API changes.
 *
 * Returns null at level 0 (Peru overview = no bounds restriction).
 *
 * The polygon geometry is used for accurate point-in-polygon filtering
 * instead of bounding-box filtering (which has overlap issues between
 * neighboring irregular polygons like Cajamarca / La Libertad).
 */

import type { GeoBounds } from "@/lib/services/geo";
import { getDepartamentos, getProvincias, getDistritos, getAdminGeometry } from "@/lib/services/geo";
import type { DrillState } from "../types";

export type DrillRegion = {
  bounds: GeoBounds;
  geometry: GeoJSON.Geometry | null;
};

export async function resolveDrillBounds(drillState: DrillState): Promise<GeoBounds | null> {
  const region = await resolveDrillRegion(drillState);
  return region?.bounds ?? null;
}

export async function resolveDrillRegion(drillState: DrillState): Promise<DrillRegion | null> {
  if (drillState.level === 0) return null;

  if (drillState.level === 1 && drillState.depCode) {
    const [depRes, geomRes] = await Promise.all([
      getDepartamentos(),
      getAdminGeometry("dep", drillState.depCode),
    ]);
    if (!depRes.ok || !depRes.departamentos) return null;
    const dep = depRes.departamentos.find((d) => d.coddep === drillState.depCode);
    if (!dep) return null;
    return {
      bounds: dep.bounds,
      geometry: geomRes.ok ? (geomRes.geometry ?? null) : null,
    };
  }

  if (drillState.level === 2 && drillState.depCode && drillState.provCode) {
    const [provRes, geomRes] = await Promise.all([
      getProvincias(drillState.depCode),
      getAdminGeometry("prov", drillState.provCode),
    ]);
    if (!provRes.ok || !provRes.provincias) return null;
    const prov = provRes.provincias.find((p) => p.codprov_full === drillState.provCode);
    if (!prov) return null;
    return {
      bounds: prov.bounds,
      geometry: geomRes.ok ? (geomRes.geometry ?? null) : null,
    };
  }

  if (drillState.level >= 3 && drillState.provCode && drillState.distCode) {
    const [distRes, geomRes] = await Promise.all([
      getDistritos(drillState.provCode),
      getAdminGeometry("dist", drillState.distCode),
    ]);
    if (!distRes.ok || !distRes.distritos) return null;
    const dist = distRes.distritos.find((d) => d.ubigeo === drillState.distCode);
    if (!dist) return null;
    return {
      bounds: dist.bounds,
      geometry: geomRes.ok ? (geomRes.geometry ?? null) : null,
    };
  }

  return null;
}

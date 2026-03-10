/* ========== Map Click Handler — drill navigation + agent/cluster selection ========== */

import { useCallback } from "react";
import type { MapRef, MapLayerMouseEvent } from "@vis.gl/react-maplibre";
import type { GeoJSONSource } from "maplibre-gl";
import type { DrillLevel, DrillState, EnrichedAgent } from "../types";
import { INITIAL_DRILL } from "../types";
import { PERU_BOUNDS, FLY_DURATION } from "../constants";
import { getBoundsFromFeature } from "../utils";
import { preloadProvincias, preloadDistritos } from "@/lib/services/geo";

/**
 * Stable click handler for the map. Reads volatile values from refs so the
 * callback identity never changes (prevents MapLibre from re-registering listeners).
 */
export function useMapClick(
  mapRef: React.RefObject<MapRef | null>,
  drillStateRef: React.RefObject<DrillState>,
  selectedAgentIdRef: React.RefObject<string | null>,
  agentsRef: React.RefObject<EnrichedAgent[]>,
  skipNextFitRef: React.MutableRefObject<boolean>,
  pendingDrillRef: React.MutableRefObject<boolean>,
  onDrillChange: (state: DrillState) => void,
  onSelectAgent: (agentId: string | null) => void,
) {
  return useCallback((e: MapLayerMouseEvent) => {
    const currentDrill = drillStateRef.current!;
    const currentSelectedAgent = selectedAgentIdRef.current;
    const currentAgents = agentsRef.current!;
    const features = e.features;

    if (!features?.length) {
      if (currentSelectedAgent) {
        onSelectAgent(null);
      }

      // Empty space (single click) → clear filters + reset zoom
      onDrillChange(INITIAL_DRILL);
      skipNextFitRef.current = true;
      pendingDrillRef.current = false;
      mapRef.current?.fitBounds(PERU_BOUNDS, { padding: 40, duration: FLY_DURATION });
      return;
    }

    const byLayer = (ids: string[]) => features.find((feature) => {
      const id = feature.layer?.id;
      return typeof id === "string" && ids.includes(id);
    });

    // Priority order matters:
    // 1) Agent markers (user intent: select agent)
    // 2) Form clusters (zoom-in intent)
    // 3) Territorial drill layers
    const agentFeature = byLayer(["agents-circles", "agents-selected-ring"]);
    if (agentFeature) {
      const agentId = agentFeature.properties?.agent_id;
      if (agentId) {
        if (currentSelectedAgent === agentId) { onSelectAgent(null); }
        else {
          onSelectAgent(agentId);
          const agent = currentAgents.find((a) => a.id === agentId);
          if (agent) {
            skipNextFitRef.current = true;
            pendingDrillRef.current = true;
            mapRef.current?.flyTo({ center: [agent.lng, agent.lat], zoom: 13, duration: FLY_DURATION });
          }
        }
      }
      return;
    }

    const clusterFeature = byLayer(["forms-clusters", "forms-cluster-ring"]);
    if (clusterFeature) {
      const clusterId = clusterFeature.properties?.cluster_id;
      const coords = (clusterFeature.geometry as GeoJSON.Point).coordinates;
      const [lng, lat] = coords;

      if (clusterId != null && mapRef.current) {
        const map = mapRef.current.getMap();
        const source = map.getSource("forms-clustered") as GeoJSONSource | undefined;

        const flyToZoom = (targetZoom: number) => {
          mapRef.current?.flyTo({ center: [lng, lat], zoom: targetZoom, duration: FLY_DURATION, essential: true });
        };

        // Mark pending — handleMoveEnd will reverse-geocode the final center
        skipNextFitRef.current = true;
        pendingDrillRef.current = true;

        if (source && typeof source.getClusterExpansionZoom === "function") {
          source.getClusterExpansionZoom(clusterId).then((zoom) => {
            flyToZoom(Math.min(zoom + 0.5, 18));
          }).catch(() => {
            flyToZoom(Math.min((mapRef.current?.getZoom() ?? 10) + 2, 18));
          });
        } else {
          flyToZoom(Math.min((mapRef.current?.getZoom() ?? 10) + 2, 18));
        }
      }
      return;
    }

    const f = features[0];
    const layerId = f.layer?.id;

    // Drill navigation
    const isDep = layerId === "dep-fill" || layerId?.startsWith("priority-dep");
    const isProv = layerId === "prov-fill" || layerId?.startsWith("priority-prov");
    const isDist = layerId === "dist-fill" || layerId?.startsWith("priority-dist");
    const isSector = layerId?.startsWith("sector");

    // Ghost layer click → go back
    const clickedLevel = isDep ? 0 : isProv ? 1 : isDist ? 2 : isSector ? 3 : -1;
    if (clickedLevel >= 0 && clickedLevel < currentDrill.level) {
      const newLevel = (currentDrill.level - 1) as DrillLevel;
      const newState = { ...currentDrill, level: newLevel };
      if (newLevel < 4) { newState.sector = null; newState.sectorName = null; }
      if (newLevel < 3) { newState.distCode = null; newState.distName = null; }
      if (newLevel < 2) { newState.provCode = null; newState.provName = null; }
      if (newLevel < 1) { newState.depCode = null; newState.depName = null; }
      onDrillChange(newState);
      if (newLevel === 0) mapRef.current?.fitBounds(PERU_BOUNDS, { padding: 40, duration: FLY_DURATION });
      return;
    }

    if (isDep) {
      const coddep = String(f.properties?.coddep ?? f.properties?.CODDEP ?? "");
      const name = String(f.properties?.departamento ?? f.properties?.departamen ?? f.properties?.DEPARTAMEN ?? coddep);
      if (coddep) {
        preloadProvincias(coddep);
        const bounds = getBoundsFromFeature(f);
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: FLY_DURATION });
        skipNextFitRef.current = true;
        onDrillChange({ ...INITIAL_DRILL, level: 1, depCode: coddep, depName: name });
      }
      return;
    }

    if (isProv) {
      const codprovFull = String(f.properties?.codprov_full ?? ((f.properties?.CODDEP ?? "") + (f.properties?.CODPROV ?? "")));
      const name = String(f.properties?.provincia ?? f.properties?.PROVINCIA ?? codprovFull);
      const coddep = String(f.properties?.coddep ?? f.properties?.CODDEP ?? currentDrill.depCode ?? "");
      if (codprovFull) {
        preloadDistritos(codprovFull);
        const bounds = getBoundsFromFeature(f);
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: FLY_DURATION });
        skipNextFitRef.current = true;
        onDrillChange({ ...currentDrill, level: 2, provCode: codprovFull, provName: name, depCode: coddep, distCode: null, distName: null, sector: null, sectorName: null });
      }
      return;
    }

    if (isDist) {
      const ubigeo = String(f.properties?.ubigeo ?? f.properties?.UBIGEO ?? "");
      const name = String(f.properties?.distrito ?? f.properties?.DISTRITO ?? ubigeo);
      const coddep = String(f.properties?.coddep ?? f.properties?.CODDEP ?? currentDrill.depCode ?? "");
      const depName = String(f.properties?.departamento ?? f.properties?.DEPARTAMEN ?? currentDrill.depName ?? "");
      const codprovFull = String(f.properties?.codprov_full ?? (((f.properties?.CODDEP ?? "") + (f.properties?.CODPROV ?? "")) || (currentDrill.provCode ?? "")));
      const provName = String(f.properties?.provincia ?? f.properties?.PROVINCIA ?? currentDrill.provName ?? "");
      if (ubigeo) {
        const bounds = getBoundsFromFeature(f);
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: FLY_DURATION });
        skipNextFitRef.current = true;
        onDrillChange({ level: 3, depCode: coddep, depName, provCode: codprovFull, provName, distCode: ubigeo, distName: name, sector: null, sectorName: null });
      }
      return;
    }

    if (isSector) {
      const sectorNum = f.properties?.sector != null ? Number(f.properties.sector) :
        f.properties?.SECTOR != null ? Number(f.properties.SECTOR) : null;
      if (sectorNum != null) {
        const bounds = getBoundsFromFeature(f);
        onDrillChange({ ...currentDrill, level: 4, sector: sectorNum, sectorName: `Sector ${sectorNum}` });
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 40, duration: FLY_DURATION });
      }
    }
  }, [mapRef, drillStateRef, selectedAgentIdRef, agentsRef, skipNextFitRef, pendingDrillRef, onDrillChange, onSelectAgent]);
}

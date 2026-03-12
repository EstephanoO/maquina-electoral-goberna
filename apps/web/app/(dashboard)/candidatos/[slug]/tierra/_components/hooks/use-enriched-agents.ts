/* ========== Enriched Agents — merge stats + locations + forms ========== */

import { useMemo } from "react";
import type { FormRecord } from "@/lib/services";
import type { CampaignStats } from "@/lib/types";
import type { AgentLocation } from "@/lib/hooks";
import type { GeoBounds } from "@/lib/services/geo";
import { formCoordsToLatLng } from "@/lib/utils";
import type { EnrichedAgent, FormPoint } from "../types";
import { getAgentStatus, pointInGeometry } from "../utils";
import type { DrillRegion } from "./use-drill-bounds";

/** Default coords (Lima) for agents with no location data at all */
const DEFAULT_LAT = -12.046;
const DEFAULT_LNG = -77.043;

/** O(1) point-in-bounding-box check */
function inBounds(lat: number, lng: number, b: GeoBounds): boolean {
  return lng >= b[0][0] && lng <= b[1][0] && lat >= b[0][1] && lat <= b[1][1];
}

/**
 * Test whether a point is inside the drill region.
 * Uses polygon geometry when available (accurate point-in-polygon),
 * falls back to bounding box (fast but may include neighboring regions).
 */
function inDrillRegion(lat: number, lng: number, region: DrillRegion): boolean {
  if (region.geometry) {
    // Fast pre-check: skip polygon test if point is outside bounding box
    if (!inBounds(lat, lng, region.bounds)) return false;
    return pointInGeometry(lng, lat, region.geometry);
  }
  // Fallback: bounding box only (when geometry fetch failed)
  return inBounds(lat, lng, region.bounds);
}

/**
 * Derive enriched agents, form points, connected count, and drill-filtered subsets
 * from the raw stats, locations, forms, and optional drill region.
 *
 * When drillRegion is provided (user clicked a zone), filteredAgents and
 * filteredFormPoints only contain items inside that polygon.
 * All counts are derived from the filtered sets so the UI stays consistent.
 *
 * Uses point-in-polygon when the polygon geometry is available (accurate),
 * falling back to bounding-box filtering when geometry is unavailable.
 *
 * Optimization: pre-indexes forms by agent_id/encuestador_id into a Map so
 * the agent loop is O(agents + forms) instead of O(agents * forms).
 */
export function useEnrichedAgents(
  stats: CampaignStats | undefined,
  locations: AgentLocation[],
  forms: FormRecord[],
  backgroundAgentIds: Set<string> = new Set(),
  drillRegion: DrillRegion | null = null,
) {
  // ── Pre-index: forms by agent_id → most recent form with coords (O(forms)) ──
  const agentFormIndex = useMemo(() => {
    const idx = new Map<string, { last: FormRecord; coords: { lat: number; lng: number } | null }>();
    // forms are sorted newest-first from API, so first match per agent wins
    for (const f of forms) {
      const keys = [f.agent_id, f.encuestador_id].filter(Boolean) as string[];
      for (const key of keys) {
        if (idx.has(key)) continue;
        const coords = formCoordsToLatLng(f.x, f.y, f.zona);
        idx.set(key, { last: f, coords });
      }
    }
    return idx;
  }, [forms]);

  const enrichedAgents = useMemo((): EnrichedAgent[] => {
    if (!stats) return [];
    const now = Date.now();
    const locMap = new Map(locations.map((l) => [l.agent_id, l]));
    const agentMap = new Map<string, EnrichedAgent>();

    for (const agent of stats.top_agents) {
      const loc = locMap.get(agent.id);
      const formEntry = agentFormIndex.get(agent.id);
      const formTs = formEntry ? new Date(formEntry.last.created_at).getTime() : 0;

      if (loc) {
        // Use the MOST RECENT timestamp between GPS location and last form submission.
        // An agent may have old GPS data but submitted a form seconds ago.
        const locTs = new Date(loc.ts).getTime();
        const bestTs = Math.max(locTs, formTs);
        const bestDate = new Date(bestTs);
        agentMap.set(agent.id, {
          id: agent.id, name: agent.name,
          status: getAgentStatus(bestDate.toISOString(), now),
          lastSeen: bestDate,
          forms_count: agent.forms_count,
          lat: loc.lat, lng: loc.lng,
        });
      } else {
        // No GPS — use pre-indexed form coords (O(1) lookup)
        const lastCoords = formEntry?.coords ?? null;
        agentMap.set(agent.id, {
          id: agent.id, name: agent.name,
          status: formTs > 0 ? getAgentStatus(new Date(formTs).toISOString(), now) : "inactive",
          lastSeen: formTs > 0 ? new Date(formTs) : new Date(0),
          forms_count: agent.forms_count,
          lat: lastCoords?.lat ?? DEFAULT_LAT,
          lng: lastCoords?.lng ?? DEFAULT_LNG,
        });
      }
    }

    for (const loc of locations) {
      if (!agentMap.has(loc.agent_id)) {
        agentMap.set(loc.agent_id, {
          id: loc.agent_id,
          name: loc.agent_name || `Agente ${loc.agent_id.slice(0, 6)}`,
          status: getAgentStatus(loc.ts, now),
          lastSeen: new Date(loc.ts),
          forms_count: 0,
          lat: loc.lat, lng: loc.lng,
        });
      }
    }

    const agents = Array.from(agentMap.values());

    // Override status for agents that sent a "background" status message.
    if (backgroundAgentIds.size > 0) {
      for (const agent of agents) {
        if (backgroundAgentIds.has(agent.id) && agent.status !== "inactive") {
          agent.status = "inactive";
        }
      }
    }

    return agents.sort((a, b) => {
      const o = { connected: 0, idle: 1, inactive: 2 };
      return o[a.status] !== o[b.status] ? o[a.status] - o[b.status] : b.forms_count - a.forms_count;
    });
  }, [stats, locations, agentFormIndex, backgroundAgentIds]);

  // ── All form points (full dataset, used by the map always) ──
  const formPoints = useMemo(
    (): FormPoint[] =>
      forms
        .map((f) => {
          const coords = formCoordsToLatLng(f.x, f.y, f.zona);
          if (!coords) return null;
          return {
            id: f.id, lat: coords.lat, lng: coords.lng,
            nombre: f.nombre, telefono: f.telefono ?? "",
            encuestador: f.encuestador ?? "", region: f.zona ?? "", created_at: f.created_at,
            agent_id: f.agent_id || f.encuestador_id,
            departamento: f.departamento || undefined,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null),
    [forms],
  );

  // ── Drill-filtered subsets — used by panel, KPIs, and overlay ──
  // When drillRegion is null (level 0), returns the full sets unchanged.
  // Uses point-in-polygon when geometry is available for accurate filtering.
  const filteredFormPoints = useMemo((): FormPoint[] => {
    if (!drillRegion) return formPoints;
    return formPoints.filter((p) => inDrillRegion(p.lat, p.lng, drillRegion));
  }, [formPoints, drillRegion]);

  const filteredAgents = useMemo((): EnrichedAgent[] => {
    if (!drillRegion) return enrichedAgents;
    return enrichedAgents.filter((a) => inDrillRegion(a.lat, a.lng, drillRegion));
  }, [enrichedAgents, drillRegion]);

  const connectedCount = useMemo(
    () => filteredAgents.filter((a) => a.status === "connected").length,
    [filteredAgents],
  );

  return {
    // Full sets — always passed to TierraMap (map shows everything, map's own
    // drill masking handles visual filtering at the GPU level)
    enrichedAgents,
    formPoints,
    // Filtered sets — used by panel/KPIs/overlay to reflect the selected zone
    filteredAgents,
    filteredFormPoints,
    connectedCount,
  };
}

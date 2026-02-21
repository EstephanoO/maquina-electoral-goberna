/* ========== Enriched Agents — merge stats + locations + forms ========== */

import { useMemo } from "react";
import type { FormRecord } from "@/lib/services";
import type { CampaignStats } from "@/lib/types";
import type { AgentLocation } from "@/lib/hooks";
import { formCoordsToLatLng } from "@/lib/utils";
import type { EnrichedAgent, FormPoint } from "../types";
import { getAgentStatus } from "../utils";

/** Default coords (Lima) for agents with no location data at all */
const DEFAULT_LAT = -12.046;
const DEFAULT_LNG = -77.043;

/**
 * Derive enriched agents, form points, connected count, and filtered subsets
 * from the raw stats, locations, and forms data.
 *
 * Optimization: pre-indexes forms by agent_id/encuestador_id into a Map so
 * the agent loop is O(agents + forms) instead of O(agents * forms).
 */
export function useEnrichedAgents(
  stats: CampaignStats | undefined,
  locations: AgentLocation[],
  forms: FormRecord[],
  selectedAgentId: string | null,
  selectedAgentIds: Set<string>,
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
      if (loc) {
        agentMap.set(agent.id, {
          id: agent.id, name: agent.name,
          status: getAgentStatus(loc.ts, now),
          lastSeen: new Date(loc.ts),
          forms_count: agent.forms_count,
          lat: loc.lat, lng: loc.lng,
        });
      } else {
        // No GPS — use pre-indexed form coords (O(1) lookup)
        const entry = agentFormIndex.get(agent.id);
        const lastCoords = entry?.coords ?? null;
        agentMap.set(agent.id, {
          id: agent.id, name: agent.name,
          status: "inactive",
          lastSeen: entry ? new Date(entry.last.created_at) : new Date(0),
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

    return Array.from(agentMap.values()).sort((a, b) => {
      const o = { connected: 0, idle: 1, inactive: 2 };
      return o[a.status] !== o[b.status] ? o[a.status] - o[b.status] : b.forms_count - a.forms_count;
    });
  }, [stats, locations, agentFormIndex]);

  const formPoints = useMemo(
    (): FormPoint[] =>
      forms
        .map((f) => {
          const coords = formCoordsToLatLng(f.x, f.y, f.zona);
          if (!coords) return null;
          return { id: f.id, lat: coords.lat, lng: coords.lng, nombre: f.nombre, created_at: f.created_at, agent_id: f.agent_id || f.encuestador_id };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null),
    [forms],
  );

  const connectedCount = useMemo(
    () => enrichedAgents.filter((a) => a.status === "connected").length,
    [enrichedAgents],
  );

  const filteredForms = useMemo(() => {
    if (selectedAgentIds.size > 0) {
      return forms.filter((f) => selectedAgentIds.has(f.agent_id ?? "") || selectedAgentIds.has(f.encuestador_id ?? ""));
    }
    if (selectedAgentId) {
      return forms.filter((f) => f.agent_id === selectedAgentId || f.encuestador_id === selectedAgentId);
    }
    return forms;
  }, [forms, selectedAgentId, selectedAgentIds]);

  const filteredAgents = useMemo(() => {
    if (selectedAgentIds.size > 0) {
      return enrichedAgents.filter((a) => selectedAgentIds.has(a.id));
    }
    if (selectedAgentId) {
      return enrichedAgents.filter((a) => a.id === selectedAgentId);
    }
    return enrichedAgents;
  }, [enrichedAgents, selectedAgentId, selectedAgentIds]);

  return { enrichedAgents, formPoints, connectedCount, filteredForms, filteredAgents };
}

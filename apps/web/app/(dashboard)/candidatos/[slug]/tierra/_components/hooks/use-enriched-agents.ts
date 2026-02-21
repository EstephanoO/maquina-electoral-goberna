/* ========== Enriched Agents — merge stats + locations + forms ========== */

import { useMemo } from "react";
import type { FormRecord } from "@/lib/services";
import type { CampaignStats } from "@/lib/types";
import type { AgentLocation } from "@/lib/hooks";
import { formCoordsToLatLng } from "@/lib/utils";
import type { EnrichedAgent, FormPoint } from "../types";
import { getAgentStatus } from "../utils";

/**
 * Derive enriched agents, form points, connected count, and filtered subsets
 * from the raw stats, locations, and forms data.
 */
export function useEnrichedAgents(
  stats: CampaignStats | undefined,
  locations: AgentLocation[],
  forms: FormRecord[],
  selectedAgentId: string | null,
  selectedAgentIds: Set<string>,
) {
  const enrichedAgents = useMemo((): EnrichedAgent[] => {
    if (!stats) return [];
    const now = Date.now();
    const locMap = new Map(locations.map((l) => [l.agent_id, l]));
    const agentMap = new Map<string, EnrichedAgent>();

    for (const agent of stats.top_agents) {
      const loc = locMap.get(agent.id);
      if (loc) {
        agentMap.set(agent.id, { id: agent.id, name: agent.name, status: getAgentStatus(loc.ts, now), lastSeen: new Date(loc.ts), forms_count: agent.forms_count, lat: loc.lat, lng: loc.lng });
      } else {
        const af = forms.filter((f) => f.encuestador_id === agent.id || f.agent_id === agent.id);
        const last = af[0];
        const lastCoords = last ? formCoordsToLatLng(last.x, last.y, last.zona) : null;
        agentMap.set(agent.id, { id: agent.id, name: agent.name, status: "inactive", lastSeen: last ? new Date(last.created_at) : new Date(0), forms_count: agent.forms_count, lat: lastCoords?.lat ?? -12.046, lng: lastCoords?.lng ?? -77.043 });
      }
    }

    for (const loc of locations) {
      if (!agentMap.has(loc.agent_id)) {
        agentMap.set(loc.agent_id, { id: loc.agent_id, name: loc.agent_name || `Agente ${loc.agent_id.slice(0, 6)}`, status: getAgentStatus(loc.ts, now), lastSeen: new Date(loc.ts), forms_count: 0, lat: loc.lat, lng: loc.lng });
      }
    }

    return Array.from(agentMap.values()).sort((a, b) => {
      const o = { connected: 0, idle: 1, inactive: 2 };
      return o[a.status] !== o[b.status] ? o[a.status] - o[b.status] : b.forms_count - a.forms_count;
    });
  }, [stats, locations, forms]);

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

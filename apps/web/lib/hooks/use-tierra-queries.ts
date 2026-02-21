/**
 * GOBERNA — TanStack React Query hooks for the Tierra (territory) page.
 *
 * Replaces manual useState + setInterval + useEffect polling with
 * declarative queries that leverage structuralSharing to prevent
 * unnecessary re-renders when polled data hasn't changed.
 *
 * Key design decisions:
 * - queryFn unwraps the `{ ok, data, error }` API envelope → throws on failure
 * - structuralSharing (on by default) ensures identical poll responses
 *   return the same object references → useMemo dependents don't re-run
 * - SSE for agent locations stays imperative (not query-managed) because
 *   it's a push channel, not a request-response cycle
 */

import { useQuery } from "@tanstack/react-query";
import { getCampaignStats, getRecentForms, api } from "@/lib/services";
import type { CampaignStats } from "@/lib/types";
import type { FormRecord } from "@/lib/services/forms";

// ── Types ──────────────────────────────────────────────────────────

export type AgentLocation = {
  agent_id: string;
  agent_name?: string;
  ts: string;
  lat: number;
  lng: number;
};

// ── Query Keys (colocated for easy invalidation) ───────────────────

export const tierraKeys = {
  all: ["tierra"] as const,
  stats: (slug: string) => [...tierraKeys.all, "stats", slug] as const,
  forms: (campaignId: string) => [...tierraKeys.all, "forms", campaignId] as const,
  locations: (campaignId: string) => [...tierraKeys.all, "locations", campaignId] as const,
};

// ── useCampaignStats ───────────────────────────────────────────────

/**
 * Fetches campaign stats (totals, top agents, chart data).
 * Refetches every 30s (staleTime default) + on window focus.
 */
export function useCampaignStats(slug: string) {
  return useQuery({
    queryKey: tierraKeys.stats(slug),
    queryFn: async (): Promise<CampaignStats> => {
      const res = await getCampaignStats(slug, "day");
      if (!res.ok || !res.data) {
        throw new Error(res.error?.message ?? "Error cargando stats");
      }
      return res.data;
    },
    // Refetch every 10s for activity log updates (connect/disconnect events from campaign buffer)
    refetchInterval: 10_000,
    staleTime: 8_000,
  });
}

// ── useRecentForms ─────────────────────────────────────────────────

/**
 * Polls recent forms every 5s with structuralSharing.
 * Only enabled when we have a campaignId (i.e., stats loaded).
 *
 * structuralSharing ensures that if the 5s poll returns identical data,
 * the `data` reference stays the same → downstream useMemo (formPoints,
 * formsGeoJson) don't recompute → TierraMap doesn't re-render.
 */
export function useRecentForms(campaignId: string | undefined) {
  return useQuery({
    queryKey: tierraKeys.forms(campaignId ?? ""),
    queryFn: async (): Promise<FormRecord[]> => {
      const res = await getRecentForms(campaignId!, 200);
      if (!res.ok || !res.data?.forms) {
        throw new Error("Error cargando formularios");
      }
      return res.data.forms;
    },
    enabled: !!campaignId,
    refetchInterval: 5_000,
    // structuralSharing is ON by default — key for P3 fix
    staleTime: 4_000, // slightly less than poll interval to avoid double-fetch
  });
}

// ── useAgentLocationsSnapshot ──────────────────────────────────────

/**
 * Initial fetch of live agent locations (one-time seed).
 * SSE updates are handled imperatively in the page component.
 * This query only fires once per mount to populate the initial state.
 */
export function useAgentLocationsSnapshot(campaignId: string | undefined) {
  return useQuery({
    queryKey: tierraKeys.locations(campaignId ?? ""),
    queryFn: async (): Promise<AgentLocation[]> => {
      const res = await api.get<{ agents: AgentLocation[] }>("/api/agents/live", {
        headers: campaignId ? { "x-campaign-id": campaignId } : undefined,
      });
      if (!res.ok || !res.data?.agents) return [];
      return res.data.agents;
    },
    enabled: !!campaignId,
    staleTime: Infinity, // SSE keeps this fresh — no automatic refetch
    refetchOnWindowFocus: false,
  });
}

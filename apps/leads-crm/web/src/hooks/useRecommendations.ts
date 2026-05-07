import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { Recommendation, Facets } from "../types/recommendation";

export function useRecommendations(reason: string = "all", limit = 30) {
  return useQuery({
    queryKey: ["recommendations", reason, limit],
    queryFn: () => api.get<{ items: Recommendation[] }>(`/recommendations?reason=${reason}&limit=${limit}`).then(r => r.items),
    staleTime: 30_000,
  });
}

export function useLeadFacets() {
  return useQuery({
    queryKey: ["lead-facets"],
    queryFn: () => api.get<Facets>("/lead-facets"),
    staleTime: 5 * 60_000,
  });
}

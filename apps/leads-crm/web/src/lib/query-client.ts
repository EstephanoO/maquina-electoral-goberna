import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,            // 30s — most lists are fine to be slightly stale
      gcTime: 5 * 60_000,           // keep in cache 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Centralized query keys — change here, invalidate everywhere consistent.
export const QK = {
  leads:        (params?: any) => ["leads", params] as const,
  lead:         (id: number)   => ["leads", id] as const,
  leadEnrich:   (id: number)   => ["leads", id, "enrichment"] as const,
  interactions: (leadId: number) => ["leads", leadId, "interactions"] as const,
  chats:        (tab?: string, q?: string) => ["chats", tab, q] as const,
  attention:    () => ["attention"] as const,
  rules:        () => ["ai", "rules"] as const,
  prompt:       () => ["ai", "prompt"] as const,
  templates:    () => ["templates"] as const,
  products:     (filter?: string) => ["products", filter] as const,
  product:      (id: number) => ["products", id] as const,
  pipeline:     () => ["config", "pipeline"] as const,
  instances:    () => ["config", "instances"] as const,
  banks:        () => ["config", "banks"] as const,
  stats:        () => ["stats"] as const,
} as const;

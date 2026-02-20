"use client";

/**
 * TanStack React Query provider — wraps the dashboard shell.
 *
 * Configuration rationale:
 * - structuralSharing: ON (default) — prevents new references when data is equal
 * - staleTime 30s — avoids refetching on every mount while keeping data fresh
 * - gcTime 5min — keeps unused query data for fast back-navigation
 * - refetchOnWindowFocus: true — re-syncs when user returns to tab
 * - retry 1 — one retry, don't hammer the backend
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            retry: 1,
            // structuralSharing is true by default — key for preventing re-renders
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

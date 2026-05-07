import { useQueries } from "@tanstack/react-query";
import { api } from "../api";
import { QK } from "../lib/query-client";
import type { Lead } from "../types";

export type ProductSummary = {
  id: number; nombre: string; sku: string | null;
  precio_dolares: string | null; precio_soles: string | null;
  fecha_inicio: string | null; rule_tag?: string | null;
};

export type RuleSummary = {
  id: number; name: string; tag: string;
  enabled: boolean; hits_count: number; source: string | null;
};

export type TemplateSummary = {
  id: number; name: string; category?: string; uses_count?: number;
};

export type DashboardData = {
  loading: boolean;
  leads: Lead[];
  products: ProductSummary[];
  rules: RuleSummary[];
  templates: TemplateSummary[];
};

export function useDashboardData(): DashboardData {
  const queries = useQueries({
    queries: [
      {
        queryKey: QK.leads({ limit: 10000 }),
        queryFn: () => api.listLeads({ limit: 10000 } as any) as Promise<Lead[]>,
      },
      {
        queryKey: QK.products("featured"),
        queryFn: () => api.get<{ products: ProductSummary[] }>("/products?featured=1").then(r => r.products),
      },
      {
        queryKey: QK.rules(),
        queryFn: () => api.get<RuleSummary[]>("/ai/rules"),
      },
      {
        queryKey: QK.templates(),
        queryFn: () => api.get<TemplateSummary[]>("/templates"),
      },
    ],
  });

  const [leadsQ, productsQ, rulesQ, templatesQ] = queries;
  return {
    loading: queries.some(q => q.isLoading),
    leads:     (leadsQ.data ?? []) as Lead[],
    products:  productsQ.data ?? [],
    rules:     rulesQ.data ?? [],
    templates: templatesQ.data ?? [],
  };
}

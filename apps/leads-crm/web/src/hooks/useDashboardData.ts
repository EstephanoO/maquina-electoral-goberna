import { useEffect, useState } from "react";
import { api } from "../api";
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

const EMPTY_PRODUCTS: ProductSummary[] = [];
const EMPTY_RULES: RuleSummary[] = [];
const EMPTY_TEMPLATES: TemplateSummary[] = [];

export function useDashboardData(): DashboardData {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [rules, setRules] = useState<RuleSummary[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.listLeads({ limit: 10000 } as any) as Promise<Lead[]>,
      api.get<{ products: ProductSummary[] }>("/products?featured=1").then(r => r.products).catch(() => EMPTY_PRODUCTS),
      api.get<RuleSummary[]>("/ai/rules").catch(() => EMPTY_RULES),
      api.get<TemplateSummary[]>("/templates").catch(() => EMPTY_TEMPLATES),
    ])
      .then(([ls, ps, rs, ts]) => {
        setLeads(ls);
        setProducts(ps);
        setRules(rs);
        setTemplates(ts);
      })
      .finally(() => setLoading(false));
  }, []);

  return { loading, leads, products, rules, templates };
}

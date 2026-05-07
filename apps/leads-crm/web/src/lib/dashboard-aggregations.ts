import type { Lead } from "../types";
import type { RuleSummary } from "../hooks/useDashboardData";

export type CountryRow = { name: string; leads: number; revenue: number };
export type StageRow = { name: string; value: number };

export function aggregateByCountry(leads: Lead[], topN = 8): CountryRow[] {
  const m = new Map<string, { leads: number; revenue: number }>();
  for (const l of leads) {
    const c = l.country || "Otro";
    const cur = m.get(c) || { leads: 0, revenue: 0 };
    cur.leads++; cur.revenue += l.total_usd_spent || 0;
    m.set(c, cur);
  }
  return [...m.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, topN)
    .map(([name, v]) => ({ name, leads: v.leads, revenue: Math.round(v.revenue) }));
}

export function aggregateByStage(leads: Lead[], stageLabel: (k: string) => string): StageRow[] {
  const m = new Map<string, number>();
  for (const l of leads) m.set(l.stage, (m.get(l.stage) || 0) + 1);
  return [...m.entries()].map(([key, value]) => ({ name: stageLabel(key), value }));
}

export type RuleBuckets = {
  productRules: RuleSummary[];
  learnedRules: RuleSummary[];
  manualRules: RuleSummary[];
};

export function bucketRulesBySource(rules: RuleSummary[]): RuleBuckets {
  return {
    productRules: rules.filter(r => r.source === "product"),
    learnedRules: rules.filter(r => r.source === "learned_p4"),
    manualRules: rules.filter(r => r.source === "manual" || !r.source),
  };
}

export function sumRevenue(leads: Lead[], filter?: (l: Lead) => boolean): number {
  return leads.reduce((s, l) => (!filter || filter(l) ? s + (l.total_usd_spent || 0) : s), 0);
}

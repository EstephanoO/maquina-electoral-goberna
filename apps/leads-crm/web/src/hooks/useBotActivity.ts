import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export type BotActivityToday = {
  msgs_in: number; auto_replies: number; msgs_manual: number;
  unique_leads_in: number; holdings_sent: number;
  agenda_proposed: number; agenda_confirmed: number;
  attention_today: number; day: string;
};

export type BotActivityDay = {
  day: string; msgs_in: number; auto_replies: number;
  msgs_manual: number; unique_leads: number;
};

export type TemplateStat = {
  id: number; name: string; category: string;
  sent_30d: number; sent_7d: number; lifetime_uses: number;
};

export type RuleStat = {
  id: number; name: string; source: string;
  hits_count: number; last_hit_at: string | null;
  enabled: boolean; tag: string;
};

export type HotLead = {
  id: number; name: string; phone: string; country: string;
  stage: string; buyer_tier: string;
  attention_reason: string; attention_at: string;
  waiting_seconds: number;
};

export function useBotActivityToday() {
  return useQuery({
    queryKey: ["bot-activity", "today"],
    queryFn: () => api.get<BotActivityToday>("/bot-activity/today"),
    refetchInterval: 30_000,
  });
}

export function useBotActivityDaily(days = 14) {
  return useQuery({
    queryKey: ["bot-activity", "daily", days],
    queryFn: () => api.get<{ items: BotActivityDay[] }>(`/bot-activity/daily?days=${days}`).then(r => r.items),
    staleTime: 60_000,
  });
}

export function useTemplateStats() {
  return useQuery({
    queryKey: ["bot-activity", "templates"],
    queryFn: () => api.get<{ items: TemplateStat[] }>("/bot-activity/templates").then(r => r.items),
    staleTime: 60_000,
  });
}

export function useRuleStats() {
  return useQuery({
    queryKey: ["bot-activity", "rules"],
    queryFn: () => api.get<{ items: RuleStat[] }>("/bot-activity/rules").then(r => r.items),
    staleTime: 60_000,
  });
}

export function useHotLeadsList() {
  return useQuery({
    queryKey: ["bot-activity", "hot-leads"],
    queryFn: () => api.get<{ items: HotLead[] }>("/bot-activity/hot-leads").then(r => r.items),
    refetchInterval: 30_000,
  });
}

export function useRecoverStale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ affected: number }>("/bot-activity/recover-stale"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bot-activity"] }),
  });
}

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export type ByCountry = { country: string; msgs: number };
export type ByHour    = { hour: number; in_count: number; out_count: number };
export type IntentRow = { tag: string; source: string; leads: number };
export type ActiveLead = {
  id: number; name: string; phone: string; country: string | null;
  stage: string; buyer_tier: string | null;
  in_count: number; out_count: number;
  attention_reason: string | null; needs_human_attention: boolean;
};
export type RecentMsg = {
  id: number; created_at: string; body: string; type: string;
  lead_id: number; lead_name: string; country: string | null;
  buyer_tier: string | null; needs_human_attention: boolean;
};
export type TodayDeep = {
  msgs_in: number; media_in: number; msgs_out: number;
  auto_replies: number; media_out: number;
  unique_leads_in: number; unique_leads_replied: number;
  holdings: number; agenda_proposed: number; agenda_confirmed: number;
  new_leads_today: number; auto_sold_today: number;
};
export type PeopleDaily = { day: string; people_in: number; new_people: number };
export type DataQuality = {
  total: number;
  with_name: number; with_email: number; with_country: number;
  with_dni: number; with_ocupacion: number;
  with_stage: number; with_tier: number;
  with_escuela_link: number; with_last_course: number;
  engaged_today: number;
  today_no_country: number; today_no_name: number; today_no_email: number;
  leads_with_tags: number;
};

const POLL = 30_000;

export function useByCountry()       { return useQuery({ queryKey: ["bot","by-country"],       queryFn: () => api.get<{ items: ByCountry[] }>("/bot-activity/by-country").then(r => r.items),       refetchInterval: POLL }); }
export function useByHour()          { return useQuery({ queryKey: ["bot","by-hour"],          queryFn: () => api.get<{ items: ByHour[] }>("/bot-activity/by-hour").then(r => r.items),             refetchInterval: POLL }); }
export function useIntentsToday()    { return useQuery({ queryKey: ["bot","intents-today"],    queryFn: () => api.get<{ items: IntentRow[] }>("/bot-activity/intents-today").then(r => r.items),    refetchInterval: POLL }); }
export function useTopActiveLeads()  { return useQuery({ queryKey: ["bot","top-active-leads"], queryFn: () => api.get<{ items: ActiveLead[] }>("/bot-activity/top-active-leads").then(r => r.items),  refetchInterval: POLL }); }
export function useRecentMessages()  { return useQuery({ queryKey: ["bot","recent-messages"],  queryFn: () => api.get<{ items: RecentMsg[] }>("/bot-activity/recent-messages?limit=20").then(r => r.items), refetchInterval: 15_000 }); }
export function useTodayDeep()       { return useQuery({ queryKey: ["bot","today-deep"],       queryFn: () => api.get<TodayDeep>("/bot-activity/today-deep"),                                          refetchInterval: POLL }); }
export function usePeopleDaily(days = 14) { return useQuery({ queryKey: ["bot","people-daily", days], queryFn: () => api.get<{ items: PeopleDaily[] }>(`/bot-activity/people-daily?days=${days}`).then(r => r.items), refetchInterval: 60_000 }); }
export function useDataQuality()     { return useQuery({ queryKey: ["bot","data-quality"],     queryFn: () => api.get<DataQuality>("/bot-activity/data-quality"),                                       refetchInterval: 60_000 }); }

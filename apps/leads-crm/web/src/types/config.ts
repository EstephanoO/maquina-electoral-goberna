export type PipelineStage = {
  id: number;
  key: string;
  label: string;
  color: string;
  position: number;
  enabled: boolean;
  group_name: string;
};

export type BotInstance = {
  id: number;
  slug: string;                  // p1, p2, p3, p4
  display_name: string;
  phone: string | null;
  agent_name: string;
  agent_signature: string | null;
  product_skus: string[] | null;
  cuenta_bancaria: string | null;
  yape_numero: string | null;
  extra_prompt: string | null;
  rule_ids: number[] | null;
  enabled: boolean;
  auto_reply: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BankAccount = {
  id: number;
  name: string;
  body: string;
  yape_numero: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export const STAGE_COLORS = [
  "bg-blue-100 text-blue-800",
  "bg-amber-100 text-amber-800",
  "bg-green-100 text-green-800",
  "bg-teal-100 text-teal-800",
  "bg-cyan-100 text-cyan-800",
  "bg-violet-100 text-violet-800",
  "bg-emerald-100 text-emerald-800",
  "bg-red-100 text-red-800",
  "bg-slate-100 text-slate-800",
  "bg-purple-100 text-purple-800",
  "bg-pink-100 text-pink-800",
  "bg-orange-100 text-orange-800",
];

export const STAGE_GROUPS = ["sale", "post", "out"] as const;

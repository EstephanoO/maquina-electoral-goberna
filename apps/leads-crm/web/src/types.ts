export type Stage = "new" | "contacted" | "interested" | "sold" | "delivered" | "follow_up" | "recontact" | "resold" | "lost";
export type Priority = "high" | "medium" | "low";

export type Lead = {
  id: number;
  name: string;
  phone: string | null;
  course: string | null;
  interests: string[];
  level: string | null;
  last_purchase_year: number | null;
  stage: Stage;
  priority: Priority;
  notes: string | null;
  tags: string[];
  next_follow_up_at: string | null;
  source: string;
  assigned_to: string | null;
  captured_by_phone: string | null;
  country: string | null;
  email: string | null;
  total_usd_spent: number;
  n_purchases: number;
  first_purchase_at: string | null;
  buyer_tier: "vip" | "repeat" | "single" | "prospect" | null;
  created_at: string;
  updated_at: string;
  last_contacted_at?: string | null;
  days_since_contact?: number | null;
  was_previously_interested?: boolean;
};

export type Stats = {
  total: number;
  byStage: { stage: string; c: number }[];
  byCourse: { course: string; c: number }[];
  byPriority?: { priority: string; c: number }[];
};

export type InteractionKind = "note" | "message_in" | "message_out" | "stage_change" | "lead_created" | "purchase";

export type Interaction = {
  id: number;
  lead_id: number;
  kind: InteractionKind;
  body: string | null;
  meta: Record<string, unknown> | null;
  by: string | null;
  created_at: string;
};

export type Template = {
  id: number;
  name: string;
  body: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type SendStatus = "pending" | "sent" | "failed" | "cancelled";

export type Send = {
  id: number;
  lead_id: number;
  body: string;
  body_parts: string[] | null;
  image_url: string | null;
  status: SendStatus;
  error: string | null;
  assigned_to: string | null;
  scheduled_at: string | null;
  created_at: string;
  sent_at: string | null;
  lead?: Lead;
};

export type Operator = {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: "operator" | "admin";
};

export const STAGES: Stage[] = ["new", "contacted", "interested", "sold", "delivered", "follow_up", "recontact", "resold", "lost"];

export const STAGE_LABELS: Record<Stage, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  interested: "Interesado",
  sold: "Vendido",
  delivered: "Entregado",
  follow_up: "Seguimiento",
  recontact: "Recontacto",
  resold: "Re-vendido",
  lost: "Perdido",
};

export const STAGE_COLORS: Record<Stage, { bg: string; fg: string; border: string }> = {
  new:        { bg: "#e0e7ff", fg: "#3730a3", border: "#c7d2fe" }, // indigo
  contacted:  { bg: "#dbeafe", fg: "#1e40af", border: "#bfdbfe" }, // blue
  interested: { bg: "#fef3c7", fg: "#92400e", border: "#fde68a" }, // amber
  sold:       { bg: "#dcfce7", fg: "#166534", border: "#bbf7d0" }, // green
  delivered:  { bg: "#ccfbf1", fg: "#115e59", border: "#99f6e4" }, // teal
  follow_up:  { bg: "#cffafe", fg: "#155e75", border: "#a5f3fc" }, // cyan
  recontact:  { bg: "#ede9fe", fg: "#5b21b6", border: "#ddd6fe" }, // violet
  resold:     { bg: "#d1fae5", fg: "#065f46", border: "#a7f3d0" }, // emerald
  lost:       { bg: "#fee2e2", fg: "#991b1b", border: "#fecaca" }, // red
};

export const PRIORITIES: Priority[] = ["high", "medium", "low"];

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: "🔥 Alta",
  medium: "• Media",
  low: "💤 Baja",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  high: "#ef4444",
  medium: "#6b7280",
  low: "#94a3b8",
};

export type Course = {
  id: number;
  name: string;
  shortname: string;
  category_id: number;
};

// Legacy fallback if Moodle is unreachable
export const COURSES = ["Inteligencia", "Oratoria"] as const;

export const LEVELS = [
  { value: "1", label: "Nivel 1 (1-5 cursos)" },
  { value: "2", label: "Nivel 2 (5-10 cursos)" },
  { value: "3", label: "Nivel 3 (10-15 cursos)" },
  { value: "4", label: "Nivel 4 (15+ cursos)" },
] as const;

export const LEVEL_LABEL: Record<string, string> = Object.fromEntries(
  LEVELS.map((l) => [l.value, l.label])
);

const NOW_YEAR = new Date().getFullYear();
export const YEARS = Array.from({ length: 8 }, (_, i) => NOW_YEAR - i);

export type CountryPrefix = { code: string; country: string };

// A WhatsApp number the company uses to send messages from.
// Not tied to a user account — the company can own phones not yet assigned.
export type SenderPhone = {
  label: string;   // "Perú 1", "México 2"…
  phone: string;   // "+51986855496" (E.164)
  country: string; // "Perú", "México"…
  active: boolean; // if false, hidden from the "Enviar desde" picker
};

export type AntiBanConfig = {
  max_per_day: number;
  min_delay_ms: number;
  max_delay_ms: number;
  burst_size: number;
  burst_rest_sec: number;
  window_start_hour: number;
  window_end_hour: number;
  circuit_fail_threshold: number;
  circuit_pause_sec: number;
  multipart_delay_min_ms: number;
  multipart_delay_max_ms: number;
};

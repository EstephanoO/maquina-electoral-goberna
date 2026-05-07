/**
 * Tipos compartidos del modelo de datos. Importados desde routers, services
 * y otros módulos del backend.
 */

export type Stage =
  | "new" | "contacted" | "interested" | "sold" | "delivered"
  | "follow_up" | "recontact" | "resold" | "lost";

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
  buyer_tier: string | null;
  created_at: string;
  updated_at: string;
  last_contacted_at?: string | null;
  days_since_contact?: number | null;
  was_previously_interested?: boolean;
};

export type LeadInput = Partial<Omit<Lead, "id" | "created_at" | "updated_at">> & {
  name?: string;
  last_activity_at?: string | null;
};

export type InteractionKind = "note" | "message_in" | "message_out" | "stage_change" | "lead_created";

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
  category: string | null;
  uses_count: number;
  product_sku: string | null;
  media_kind: string | null;
  sequence_after: number | null;
  document_url: string | null;
  document_filename: string | null;
  document_mime: string | null;
  video_url: string | null;
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
};

export type Operator = {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: "operator" | "admin";
};

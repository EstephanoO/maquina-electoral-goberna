/**
 * GOBERNA — Shared Types
 * Central type definitions for the web application.
 */

// ── API Response Types ─────────────────────────────────────────────

export type ApiResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
  status: number;
};

// ── Campaign / Candidate Types ─────────────────────────────────────

export type CampaignConfig = {
  color_primario?: string;
  color_secundario?: string;
  modules?: string[];
  tracking_enabled?: boolean;
  forms_enabled?: boolean;
  has_ga4_data?: boolean;
};

export type Campaign = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "paused" | "archived";
  cargo: string | null;
  numero: number | null;
  partido: string | null;
  foto_url: string | null;
  config: CampaignConfig | null;
  user_count?: number;
  created_at?: string;
  updated_at?: string;
};

export type CandidatePublic = {
  id: string;
  name: string;
  slug: string;
  cargo: string | null;
  numero: number | null;
  partido: string | null;
  foto_url: string | null;
  color_primario: string;
  color_secundario: string;
};

// ── Access Request Types ───────────────────────────────────────────

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export type AccessRequest = {
  id: string;
  user_id: string;
  campaign_id: string;
  status: AccessRequestStatus;
  requested_at: string;
  resolved_at: string | null;
  note: string | null;
  user_email?: string;
  user_full_name?: string;
  campaign_name?: string;
  campaign_cargo?: string;
  campaign_numero?: number;
};

// ── User Types ─────────────────────────────────────────────────────

export type UserRole = "admin" | "consultor" | "candidato" | "brigadista_zonal" | "agente_campo" | "agente_digital";

export type User = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  status: string;
  campaigns?: UserCampaign[];
};

export type UserCampaign = {
  campaign_id: string;
  campaign_name: string;
  campaign_slug: string;
  role: string;
  perm_tierra: boolean;
  perm_digital: boolean;
};

// ── Form Types ─────────────────────────────────────────────────────

export type FormDefinitionStatus = "draft" | "active" | "archived";

export type FormField = {
  id: string;
  type: "text" | "phone" | "email" | "number" | "textarea" | "select" | "checkbox" | "location" | "photo";
  label: string;
  placeholder?: string;
  required?: boolean;
  validation?: Record<string, unknown>;
  options?: { value: string; label: string }[];
};

export type FormSchema = {
  version: string;
  fields: FormField[];
};

export type FormDefinition = {
  id: string;
  campaign_id: string;
  name: string;
  slug: string;
  description: string | null;
  schema: FormSchema;
  status: FormDefinitionStatus;
  version?: number;
  created_at?: string;
  updated_at?: string;
};

// ── Upload Types ───────────────────────────────────────────────────

export type UploadResult = {
  filename: string;
  path: string;
  size: number;
  content_type: string;
};

// ── Component Props Types ──────────────────────────────────────────

export type StatusType = "pending" | "approved" | "rejected" | "active" | "paused" | "archived" | "draft";

export type TabId = "candidatos" | "solicitudes" | "formularios" | "equipo";

// ── Dashboard Stats Types ──────────────────────────────────────────

export type CampaignEvent = {
  type: "form_submitted" | "agent_connected" | "agent_disconnected";
  agent_id: string;
  agent_name: string;
  timestamp: string;
  message: string;
};

export type TopAgent = {
  id: string;
  name: string;
  forms_count: number;
  forms_today: number;
};

export type AgentFormsData = {
  id: string;
  name: string;
  count: number;
};

// ── Brigadista CMS Metrics ──────────────────────────────────────────

export type CmsBrigadistaMetrics = {
  brigadista_id: string;
  full_name: string;
  email: string;
  /** Total unique phone numbers captured (first-write-wins dedup) */
  total_captures: number;
  /** Unique phones still in 'nuevo' status */
  nuevos: number;
  /** Unique phones in 'hablado' status */
  hablados: number;
  /** Unique phones in 'respondieron' status */
  respondieron: number;
  /** Unique phones in 'archivado' status */
  archivados: number;
  /** (hablados + respondieron) / total */
  contact_rate: number;
  /** respondieron / (hablados + respondieron) */
  response_rate: number;
};

// ── Campaign Stats ─────────────────────────────────────────────────

export type CampaignStats = {
  campaign: {
    id: string;
    name: string;
    slug: string;
    cargo: string | null;
    numero: number | null;
    partido: string | null;
    foto_url: string | null;
    color_primario: string;
    color_secundario: string;
    whatsapp_channel_url?: string;
  };
  metas: {
    datos: number;
    votos: number;
  };
  totals: {
    forms_count: number;
    forms_today: number;
    forms_week: number;
  };
  top_agents: TopAgent[];
  agent_forms_chart: AgentFormsData[];
  recent_events: CampaignEvent[];
};

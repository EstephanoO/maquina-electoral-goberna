/**
 * GOBERNA — Typed API Contracts
 *
 * Single source of truth for request/response shapes across backend, web, and mobile.
 * Import this file from apps/web and apps/mobile to keep types in sync.
 *
 * Generated from backend route handlers, Zod schemas, and repository types.
 * Last updated: 2026-02-18
 */

// ═══════════════════════════════════════════════════════════════════════
// COMMON
// ═══════════════════════════════════════════════════════════════════════

export type ApiSuccess<T = unknown> = { ok: true; request_id: string } & T;
export type ApiError = {
  ok: false;
  request_id: string;
  code: string;
  message: string;
};
export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ── Roles ─────────────────────────────────────────────────────────────
export type Role = "admin" | "consultor" | "jefe_campana" | "brigadista_zonal" | "agente_campo";

export const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 50,
  consultor: 40,
  jefe_campana: 30,
  brigadista_zonal: 20,
  agente_campo: 10,
};

// ── Pagination ────────────────────────────────────────────────────────
export type PaginationQuery = {
  limit?: number;
  offset?: number;
};

// ── Campaign Permissions ──────────────────────────────────────────────
export type CampaignPerms = {
  tierra: boolean;
  digital: boolean;
};

// ═══════════════════════════════════════════════════════════════════════
// AUTH — /api/auth/*
// ═══════════════════════════════════════════════════════════════════════

// ── POST /api/auth/login ──────────────────────────────────────────────
export type LoginRequest = {
  email: string;
  password: string;
};

export type UserInfo = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: "active" | "pending" | "suspended";
};

export type CampaignInfo = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

export type LoginResponse = ApiSuccess<{
  access_token: string;
  refresh_token: string;
  user: UserInfo;
  campaigns: CampaignInfo[];
}>;

// ── POST /api/auth/register ───────────────────────────────────────────
export type RegisterRequest = {
  email: string;
  password: string;
  full_name: string;
  invitation_code?: string;
  campaign_id?: string;
};

export type RegisterResponse = ApiSuccess<{
  user: UserInfo;
  invitation_used: boolean;
}>;

// ── POST /api/auth/refresh ────────────────────────────────────────────
export type RefreshRequest = {
  refresh_token: string;
};

export type RefreshResponse = ApiSuccess<{
  access_token: string;
  refresh_token: string;
}>;

// ── POST /api/auth/change-password ────────────────────────────────────
export type ChangePasswordRequest = {
  current_password: string;
  new_password: string;
};

// ── POST /api/auth/logout ─────────────────────────────────────────────
// No body needed.

// ── GET /api/auth/me ──────────────────────────────────────────────────
export type MeResponse = ApiSuccess<{
  user: UserInfo;
  campaigns: CampaignInfo[];
}>;

// ═══════════════════════════════════════════════════════════════════════
// CAMPAIGNS — /api/campaigns/*
// ═══════════════════════════════════════════════════════════════════════

export type Campaign = {
  id: string;
  name: string;
  slug: string;
  config: Record<string, unknown>;
  status: "active" | "paused" | "archived";
  cargo: string | null;
  numero: number | null;
  partido: string | null;
  foto_url: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignStats = Campaign & {
  agente_campo_count: number;
  brigadista_zonal_count: number;
  jefe_campana_count: number;
  consultor_count: number;
  admin_count: number;
};

export type CampaignMember = {
  user_id: string;
  full_name: string;
  email: string;
  role: Role;
  user_status: string;
};

// ── GET /api/candidates ───────────────────────────────────────────────
export type Candidate = {
  id: string;
  name: string;
  slug: string;
  cargo: string | null;
  numero: number | null;
  partido: string | null;
  foto_url: string | null;
  color_primario: string | null;
  color_secundario: string | null;
};

export type CandidatesResponse = ApiSuccess<{
  candidates: Candidate[];
}>;

// ── POST /api/campaigns ──────────────────────────────────────────────
export type CreateCampaignRequest = {
  name: string;
  slug: string;
  config?: Record<string, unknown>;
  cargo?: string;
  numero?: number;
  partido?: string;
  foto_url?: string;
};

// ── PUT /api/campaigns/:campaignId ───────────────────────────────────
export type UpdateCampaignRequest = {
  name?: string;
  config?: Record<string, unknown>;
  status?: "active" | "paused" | "archived";
  cargo?: string;
  numero?: number;
  partido?: string;
  foto_url?: string;
};

// ── POST /api/campaigns/:campaignId/members ──────────────────────────
export type AddMemberRequest = {
  user_id: string;
  role: Role;
};

// ── PUT /api/campaigns/:campaignId/members/:userId/role ──────────────
export type UpdateMemberRoleRequest = {
  role: Exclude<Role, "admin">;
};

// ── GET /api/campaigns/:slug/stats ───────────────────────────────────
export type CampaignStatsResponse = ApiSuccess<{
  campaign: {
    id: string;
    name: string;
    slug: string;
    cargo: string | null;
    numero: number | null;
    partido: string | null;
    foto_url: string | null;
    color_primario: string | null;
    color_secundario: string | null;
  };
  metas: { datos: number; votos: number };
  totals: { forms_count: number; forms_today: number; forms_week: number };
  top_agents: Array<{
    id: string;
    name: string;
    forms_count: number;
    forms_today: number;
  }>;
  agent_forms_chart: Array<{
    id: string;
    name: string;
    count: number;
  }>;
  recent_events: Array<{
    type: "form_submitted" | "agent_connected" | "agent_disconnected";
    agent_id: string;
    agent_name: string;
    timestamp: string;
    message: string;
  }>;
}>;

// ═══════════════════════════════════════════════════════════════════════
// FORM DEFINITIONS — /api/form-definitions/*
// ═══════════════════════════════════════════════════════════════════════

export type FormFieldType =
  | "text" | "number" | "email" | "phone" | "textarea"
  | "select" | "radio" | "checkbox" | "date" | "location" | "photo";

export type FormFieldOption = {
  value: string;
  label: string;
};

export type FormFieldValidation = {
  min?: number;
  max?: number;
  pattern?: string;
  options?: string[];
};

export type FormField = {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  validation?: FormFieldValidation;
  options?: FormFieldOption[];
  defaultValue?: unknown;
  conditionalOn?: { fieldId: string; value: unknown };
};

export type FormSchema = {
  version?: string;
  fields: FormField[];
};

export type FormDefinition = {
  id: string;
  campaign_id: string;
  name: string;
  slug: string;
  description: string | null;
  schema: FormSchema;
  status: "draft" | "active" | "archived";
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (optional, present in list queries)
  campaign_name?: string;
  campaign_slug?: string;
  created_by_name?: string;
};

export type CreateFormDefinitionRequest = {
  campaign_id: string;
  name: string;
  slug: string;
  description?: string;
  schema: FormSchema;
};

export type UpdateFormDefinitionRequest = {
  name?: string;
  slug?: string;
  description?: string | null;
  schema?: FormSchema;
  status?: "draft" | "active" | "archived";
};

// ═══════════════════════════════════════════════════════════════════════
// FORMS (LEGACY) — /api/forms/*
// ═══════════════════════════════════════════════════════════════════════

export type FormInput = {
  nombre: string;
  telefono: string;
  fecha: string;
  x: number;
  y: number;
  zona: string;
  candidate?: string;
  encuestador: string;
  encuestador_id: string;
  candidato_preferido: string;
  client_id: string;
  home_maps_url?: string;
  polling_place_url?: string;
  comentarios?: string;
  campaign_id?: string;
  form_definition_id?: string;
};

export type FormRecord = {
  id: string;
  client_id: string;
  nombre: string;
  telefono: string;
  fecha: string;
  x: number;
  y: number;
  zona: string;
  encuestador: string;
  encuestador_id: string;
  candidato_preferido: string;
  comentarios: string | null;
  campaign_id: string | null;
  created_at: string;
};

export type FormsIngestResponse = ApiSuccess<{
  accepted: number;
  deduped: number;
  queue_depth: number;
}>;

export type FormsListResponse = ApiSuccess<{
  forms: FormRecord[];
  total: number;
  limit: number;
  offset: number;
}>;

// ═══════════════════════════════════════════════════════════════════════
// FORM SUBMISSIONS (NEW JSONB) — /api/form-submissions/*
// ═══════════════════════════════════════════════════════════════════════

export type FormSubmissionInput = {
  form_definition_id?: string;
  campaign_id?: string;
  meet_id?: string;
  meet_group_id?: string;
  data: Record<string, unknown>;
  lat?: number;
  lng?: number;
  client_id: string;
};

export type FormSubmission = {
  id: string;
  form_definition_id: string | null;
  campaign_id: string;
  meet_id: string | null;
  meet_group_id: string | null;
  submitted_by: string | null;
  data: Record<string, unknown>;
  lat: number | null;
  lng: number | null;
  client_id: string;
  synced_at: string | null;
  created_at: string;
};

export type FormSubmissionsListResponse = ApiSuccess<{
  submissions: FormSubmission[];
  total: number;
  limit: number;
  offset: number;
}>;

export type FormSubmissionsBatchRequest = {
  submissions: FormSubmissionInput[];
};

// ── POST /api/form-submissions ──────────────────────────────────────
// ── POST /api/form-submissions/batch ────────────────────────────────
export type FormSubmissionCreateResponse = ApiSuccess<{
  accepted: number;
  attempted: number;
}>;

export type FormSubmissionsStatsResponse = ApiSuccess<{
  stats: {
    total: number;
    today: number;
    week: number;
  };
}>;

export type FormSubmissionsRecentResponse = ApiSuccess<{
  submissions: FormSubmission[];
}>;

export type FormSubmissionsByMeetResponse = ApiSuccess<{
  submissions: FormSubmission[];
}>;

// ═══════════════════════════════════════════════════════════════════════
// AGENTS (TRACKING) — /api/agents/*
// ═══════════════════════════════════════════════════════════════════════

export type AgentLocationInput = {
  agent_id: string;
  ts: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  battery?: number;
  seq: number;
  campaign_id?: string;
};

export type AgentLocationBatchRequest = {
  locations: AgentLocationInput[];
};

export type AgentLive = {
  agent_id: string;
  ts: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  seq: number;
  campaign_id: string | null;
};

export type AgentsLiveResponse = ApiSuccess<{
  ts: string;
  agents: AgentLive[];
}>;

export type AgentLocationResponse = ApiSuccess<{
  accepted: boolean;
  server_ts: string;
}>;

export type AgentLocationBatchResponse = ApiSuccess<{
  total: number;
  accepted: number;
  deduped: number;
  failed: number;
  server_ts: string;
}>;

export type AgentsHealthResponse = {
  ok: boolean;
  service: "agents-tracking";
  ts: string;
  online_agents: number;
  sse_clients: number;
  stale_after_ms: number;
  heartbeat_ms: number;
  queue_depth: number;
  queue_flushing: boolean;
  last_flush_at: string | null;
  last_flush_duration_ms: number | null;
  last_flush_attempted: number | null;
  last_flush_accepted: number | null;
  last_ingest_at: string | null;
  last_ingest_age_ms: number | null;
};

// ── SSE Events ────────────────────────────────────────────────────────
export type SSESnapshotEvent = {
  ts: string;
  agents: AgentLive[];
};

export type SSELocationBatchEvent = {
  ts: string;
  agents: AgentLive[];
};

export type SSEHeartbeatEvent = {
  ts: string;
};

export type SSEAgentOfflineEvent = {
  agent_id: string;
  ts: string;
};

// ═══════════════════════════════════════════════════════════════════════
// MEETS — /api/meets/*
// ═══════════════════════════════════════════════════════════════════════

export type MeetStatus = "pending_location" | "scheduled" | "active" | "completed" | "cancelled";
export type MeetType = "recoleccion" | "reunion" | "capacitacion";

export type Meet = {
  id: string;
  campaign_id: string;
  title: string;
  description: string | null;
  location_name: string | null;
  lat: number | null;
  lng: number | null;
  status: MeetStatus;
  starts_at: string;
  ends_at: string | null;
  created_by: string | null;
  leader_id: string | null;
  zone_id: string | null;
  meet_type: MeetType;
  directions_text: string | null;
  directions_url: string | null;
  collection_center_lat: number | null;
  collection_center_lng: number | null;
  collection_radius_meters: number | null;
  target_forms: number | null;
  created_at: string;
  updated_at: string;
};

export type MeetWithParticipantCount = Meet & {
  participant_count: number;
};

export type MeetSummary = Meet & {
  participant_count: number;
  active_participants: number;
  forms_count: number;
};

export type MeetParticipant = {
  meet_id: string;
  user_id: string;
  full_name: string;
  role: string;
  joined_at: string;
  left_at: string | null;
};

export type CreateMeetRequest = {
  campaign_id: string;
  title: string;
  description?: string;
  location_name?: string;
  lat?: number;
  lng?: number;
  starts_at: string;
  ends_at?: string;
  leader_id?: string;
  zone_id?: string;
  meet_type?: MeetType;
  directions_text?: string;
  directions_url?: string;
  collection_center_lat?: number;
  collection_center_lng?: number;
  collection_radius_meters?: number;
  target_forms?: number;
};

export type UpdateMeetRequest = {
  title?: string;
  description?: string;
  location_name?: string;
  lat?: number;
  lng?: number;
  starts_at?: string;
  ends_at?: string;
  leader_id?: string | null;
  zone_id?: string | null;
  meet_type?: MeetType;
  directions_text?: string | null;
  directions_url?: string | null;
  collection_center_lat?: number | null;
  collection_center_lng?: number | null;
  collection_radius_meters?: number | null;
  target_forms?: number | null;
};

export type UpdateMeetStatusRequest = {
  status: MeetStatus;
};

/** Valid state transitions for meets */
export const MEET_STATE_TRANSITIONS: Record<MeetStatus, MeetStatus[]> = {
  pending_location: ["scheduled", "cancelled"],
  scheduled: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// ═══════════════════════════════════════════════════════════════════════
// ZONES — /api/zones/*
// ═══════════════════════════════════════════════════════════════════════

export type Zone = {
  id: string;
  campaign_id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  color: string;
  assigned_to: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ZoneWithAssignee = Zone & {
  assignee_name: string | null;
  assignee_role: string | null;
};

export type CreateZoneRequest = {
  campaign_id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_meters?: number;
  color?: string;
  assigned_to?: string;
  metadata?: Record<string, unknown>;
};

export type UpdateZoneRequest = {
  name?: string;
  center_lat?: number;
  center_lng?: number;
  radius_meters?: number;
  color?: string;
  assigned_to?: string | null;
  metadata?: Record<string, unknown>;
};

export type ZoneGeoJsonResponse = ApiSuccess<{
  geojson: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      properties: {
        id: string;
        name: string;
        radius_meters: number;
        color: string;
        assigned_to: string | null;
        assignee_name: string | null;
      };
      geometry: {
        type: "Point";
        coordinates: [number, number]; // [lng, lat]
      };
    }>;
  };
}>;

// ═══════════════════════════════════════════════════════════════════════
// ORG HIERARCHY — /api/org-hierarchy/*
// ═══════════════════════════════════════════════════════════════════════

export type OrgNode = {
  id: string;
  campaign_id: string;
  user_id: string;
  parent_user_id: string | null;
  role: Role;
  zone_id: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export type OrgNodeWithUser = OrgNode & {
  user_name: string;
  user_email: string;
  parent_name: string | null;
  zone_name: string | null;
};

export type CreateOrgNodeRequest = {
  campaign_id: string;
  user_id: string;
  parent_user_id?: string | null;
  role: Role;
  zone_id?: string | null;
};

export type UpdateOrgNodeRequest = {
  parent_user_id?: string | null;
  role?: Role;
  zone_id?: string | null;
  status?: "active" | "inactive";
};

// ═══════════════════════════════════════════════════════════════════════
// INVITATIONS — /api/invitations/*
// ═══════════════════════════════════════════════════════════════════════

export type Invitation = {
  id: string;
  campaign_id: string;
  code: string;
  role: Exclude<Role, "admin">;
  parent_user_id: string | null;
  zone_id: string | null;
  created_by: string;
  max_uses: number;
  used_count: number;
  expires_at: string;
  created_at: string;
};

export type InvitationWithCampaign = Invitation & {
  campaign_name: string;
  campaign_slug: string;
};

export type CreateInvitationRequest = {
  campaign_id: string;
  role: Exclude<Role, "admin">;
  parent_user_id?: string | null;
  zone_id?: string | null;
  max_uses?: number;
  expires_in_hours?: number;
};

export type ValidateInvitationResponse = ApiSuccess<{
  valid: boolean;
  invitation: {
    campaign_name: string;
    campaign_slug: string;
    role: string;
  } | null;
}>;

// ═══════════════════════════════════════════════════════════════════════
// ACCESS REQUESTS — /api/access-requests/*
// ═══════════════════════════════════════════════════════════════════════

export type AccessRequest = {
  id: string;
  user_id: string;
  campaign_id: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  note: string | null;
  perm_tierra?: boolean;
  perm_digital?: boolean;
  // Joined fields
  user_email?: string;
  user_full_name?: string;
  campaign_name?: string;
  campaign_cargo?: string;
  campaign_numero?: number;
};

/** Mobile-friendly format returned by GET /api/access-requests/pending */
export type AccessRequestPending = {
  id: string;
  user_id: string;
  campaign_id: string;
  status: string;
  full_name: string;
  email: string;
  created_at: string;
  campaign_name: string | undefined;
};

export type CreateAccessRequestRequest = {
  campaign_id: string;
  perm_tierra?: boolean;
  perm_digital?: boolean;
};

export type ResolveAccessRequestRequest = {
  status: "approved" | "rejected";
  note?: string;
  role?: Exclude<Role, "admin">;
};

// ═══════════════════════════════════════════════════════════════════════
// UPLOADS — /api/uploads
// ═══════════════════════════════════════════════════════════════════════

export type UploadResponse = ApiSuccess<{
  upload: {
    filename: string;
    path: string;
    size: number;
    content_type: string;
  };
}>;

// ═══════════════════════════════════════════════════════════════════════
// MAP — /api/config, /api/tiles/*
// ═══════════════════════════════════════════════════════════════════════

export type MapConfigResponse = {
  tegolaBaseUrl: string;
  mapName: string;
  tileUrlTemplate: string;
  layers: Array<{
    id: string;
    sourceLayer: string;
    minZoom: number;
    maxZoom: number;
  }>;
};

// ═══════════════════════════════════════════════════════════════════════
// HEALTH / OPS — /api/health, /api/ready, /api/ops/system
// ═══════════════════════════════════════════════════════════════════════

export type HealthResponse = {
  ok: true;
  service: string;
  map: string;
  ts: string;
};

export type ReadyResponse = {
  ok: boolean;
  checks: {
    database: boolean;
    tegola: boolean;
    redis: boolean;
  };
  ts: string;
  error?: string;
};

export type SystemResponse = ApiSuccess<{
  ts: string;
  cpu_percent: number;
  mem_percent: number;
  disk_percent: number;
  uptime_seconds: number;
}>;

// ═══════════════════════════════════════════════════════════════════════
// METRICS — GET /api/metrics (admin only)
// ═══════════════════════════════════════════════════════════════════════

export type PercentileStats = {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
};

export type MetricsResponse = {
  ok: true;
  latencies: Record<string, PercentileStats>;
  ingest_outcome_latencies: {
    forms?: Record<string, PercentileStats>;
    tracking?: Record<string, PercentileStats>;
  };
  counters: Record<string, Record<string, number>>;
  gauges: Record<string, number>;
};

// ═══════════════════════════════════════════════════════════════════════
// ERROR CODES (complete reference)
// ═══════════════════════════════════════════════════════════════════════

export type ErrorCode =
  // Auth
  | "AUTH_TOKEN_MISSING"
  | "AUTH_TOKEN_INVALID"
  | "AUTH_TOKEN_EXPIRED"
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_INVALID_PASSWORD"
  | "AUTH_USER_SUSPENDED"
  | "AUTH_USER_PENDING"
  | "AUTH_EMAIL_EXISTS"
  | "AUTH_REFRESH_INVALID"
  | "AUTH_REFRESH_REVOKED"
  | "AUTH_REFRESH_EXPIRED"
  | "AUTH_USER_INACTIVE"
  // Authorization
  | "AUTHZ_ROLE_INVALID"
  | "AUTHZ_ROLE_INSUFFICIENT"
  | "AUTHZ_CAMPAIGN_MISSING"
  | "AUTHZ_CAMPAIGN_DENIED"
  | "AUTHZ_PERMISSION_DENIED"
  // Validation
  | "VALIDATION_ERROR"
  | "INVALID_PAYLOAD"
  // Rate limit
  | "RATE_LIMITED"
  // Resource
  | "NOT_FOUND"
  | "USER_NOT_FOUND"
  | "CAMPAIGN_NOT_FOUND"
  | "CAMPAIGN_SLUG_EXISTS"
  | "MEET_NOT_FOUND"
  | "MEET_NOT_JOINABLE"
  | "ZONE_NOT_FOUND"
  | "INVITATION_NOT_FOUND"
  | "INVITATION_EXPIRED"
  | "FORM_DEFINITION_NOT_FOUND"
  | "FORM_DEFINITION_SLUG_EXISTS"
  | "ACCESS_REQUEST_NOT_FOUND"
  | "ACCESS_REQUEST_DUPLICATE"
  | "MEMBER_NOT_FOUND"
  // State
  | "INVALID_TRANSITION"
  // Ingestion
  | "FORMS_BACKPRESSURE"
  | "TRACKING_BACKPRESSURE"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_TOKEN"
  // Infrastructure
  | "UPSTREAM_ERROR"
  | "REQUEST_ERROR"
  // Catch-all module errors
  | "CAMPAIGN_CREATE_ERROR"
  | "CAMPAIGN_UPDATE_ERROR"
  | "CAMPAIGN_GET_ERROR"
  | "CAMPAIGN_STATS_ERROR"
  | "CAMPAIGN_MEMBER_ERROR"
  | "CAMPAIGN_MEMBERS_ERROR"
  | "CAMPAIGNS_LIST_ERROR"
  | "CANDIDATES_LIST_ERROR"
  | "MEET_CREATE_ERROR"
  | "MEET_UPDATE_ERROR"
  | "MEET_GET_ERROR"
  | "MEET_SUMMARY_ERROR"
  | "MEET_STATUS_ERROR"
  | "MEET_DELETE_ERROR"
  | "MEET_JOIN_ERROR"
  | "MEET_LEAVE_ERROR"
  | "MEET_PARTICIPANTS_ERROR"
  | "MEETS_LIST_ERROR"
  | "ZONE_CREATE_ERROR"
  | "ZONE_UPDATE_ERROR"
  | "ZONE_GET_ERROR"
  | "ZONE_DELETE_ERROR"
  | "ZONES_LIST_ERROR"
  | "ZONES_GEOJSON_ERROR"
  | "FORM_DEFINITIONS_LIST_ERROR"
  | "FORM_DEFINITIONS_GET_ERROR"
  | "FORM_DEFINITION_CREATE_ERROR"
  | "FORM_DEFINITION_UPDATE_ERROR"
  | "FORM_DEFINITION_DELETE_ERROR"
  | "FORMS_LIST_ERROR"
  | "FORMS_RECENT_ERROR"
  | "INGEST_ERROR"
  | "TRACKING_INGEST_ERROR"
  | "TRACKING_BATCH_ERROR"
  | "SUBMISSION_CREATE_ERROR"
  | "SUBMISSION_BATCH_ERROR"
  | "SUBMISSIONS_LIST_ERROR"
  | "SUBMISSIONS_RECENT_ERROR"
  | "SUBMISSIONS_MEET_ERROR"
  | "SUBMISSIONS_STATS_ERROR"
  | "ACCESS_REQUEST_CREATE_ERROR"
  | "ACCESS_REQUEST_LIST_ERROR"
  | "ACCESS_REQUEST_RESOLVE_ERROR"
  | "UPLOAD_ERROR"
  | "INVALID_FILE_TYPE"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE";

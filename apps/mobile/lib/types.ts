/**
 * Tipos compartidos para toda la app Expo.
 * Estos tipos definen el contrato con el backend real en api.goberna.us.
 * Si el backend cambia, este archivo cambia y TypeScript te dice que se rompio.
 *
 * Backend contracts verified 2026-02-16 against live VPS.
 */

// ─── Auth ───────────────────────────────────────────────────

/** Backend roles - matches ROLE_HIERARCHY in backend authorize.ts */
export type UserRole =
  | 'admin'
  | 'consultor'
  | 'candidato'
  | 'brigadista_zonal'
  | 'agente_campo'
  | 'agente_digital';
export type UserStatus = 'active' | 'pending' | 'suspended';

export type AuthUser = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
};

/** Campaign membership as returned by POST /api/auth/login and GET /api/auth/me */
export type CampaignMembership = {
  id: string;
  name: string;
  slug: string;
  role: UserRole;
};

export type LoginRequest = {
  identifier: string;  // email or phone number
  password: string;
};

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
  campaigns: CampaignMembership[];
  /** If true, user must set new password before accessing the app */
  password_reset_required?: boolean;
};

/** Backend expects: { email, password, full_name, phone, region, campaign_id } */
export type RegisterRequest = {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  region: string;
  campaign_id?: string;
};

/** Backend returns the created user object */
export type RegisterResponse = {
  user: {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    status: UserStatus;
  };
};

export type RefreshRequest = {
  refresh_token: string;
};

export type RefreshResponse = {
  access_token: string;
  refresh_token: string;
};

// ─── Candidates (GET /api/candidates — public) ──────────────

export type CandidateInfo = {
  id: string;
  name: string;
  slug: string;
  cargo: string;
  numero: number;
  partido: string;
  foto_url: string | null;
};

// ─── Campaign detail (GET /api/campaigns/:id) ───────────────

export type CampaignConfig = {
  id: string;
  name: string;
  slug: string;
  cargo: string;
  numero: number;
  partido: string;
  foto_url: string | null;
  config: {
    color_primario?: string;
    color_secundario?: string;
    logo_url?: string | null;
  } | null;
};

// ─── Form Definitions (GET /api/form-definitions/active) ────

export type FormFieldType =
  | 'text'
  | 'phone'
  | 'number'
  | 'email'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'date'
  | 'location'
  | 'url';

export type FormField = {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    maxLength?: number;
  };
  options?: { value: string; label: string }[];
};

export type FormDefinition = {
  id: string;
  campaign_id: string;
  name: string;
  slug: string;
  description: string | null;
  schema: {
    fields: FormField[];
  };
  status: 'draft' | 'active' | 'archived';
  version: number;
};

// ─── Form Submission (POST /api/forms) ──────────────────────
// Backend schema: nombre, telefono, fecha, x, y, zona, encuestador,
// encuestador_id, candidato_preferido, client_id, campaign_id, form_definition_id

export type FormSubmissionPayload = {
  nombre: string;
  telefono: string;
  fecha: string;
  x: number;
  y: number;
  zona: string;
  encuestador: string;
  encuestador_id: string;
  candidato_preferido: string;
  client_id: string;
  campaign_id?: string;
  form_definition_id?: string;
  home_maps_url?: string;
  polling_place_url?: string;
  comentarios?: string;
};

// ─── UTM conversion ─────────────────────────────────────────

export type UtmData = {
  zone: number;
  hemisphere: 'N' | 'S';
  easting: number;
  northing: number;
  datum_epsg: number;
  // Original lat/lng for backend sync
  latitude?: number;
  longitude?: number;
};

// ─── Access Requests ────────────────────────────────────────

/** POST /api/access-requests expects: { campaign_id, perm_tierra?, perm_digital? } */
export type CreateAccessRequestPayload = {
  campaign_id: string;
  perm_tierra?: boolean;
  perm_digital?: boolean;
};

/** PUT /api/access-requests/:id expects: { status: 'approved' | 'rejected', role?, note? } */
export type ResolveAccessRequestPayload = {
  status: 'approved' | 'rejected';
  role?: string; // Role to assign when approving (agente_campo, brigadista_zonal, jefe_campana)
  note?: string;
};

export type AccessRequestRow = {
  id: string;
  user_id: string;
  campaign_id: string;
  status: 'pending' | 'approved' | 'rejected';
  full_name: string;
  email: string;
  phone: string;
  region: string;
  campaign_name?: string;
  created_at: string;
};

// ─── Composed App Config (built client-side from multiple endpoints) ─

export type AppConfig = {
  candidate: CandidateInfo & {
    color_primario: string;
    color_secundario: string;
    logo_url: string | null;
  };
  form: FormDefinition | null;
  agent: {
    id: string;
    full_name: string;
    email: string;
    role: UserRole;
  };
  campaign: CampaignMembership;
};

// ─── Agent Tracking (GET /api/agents/live, SSE /api/agents/stream) ───

/** Wire format for agent location as returned by the backend */
export type AgentLocationWire = {
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

/** SSE events from GET /api/agents/stream */
export type AgentStreamEvent =
  | { type: 'snapshot'; ts: string; agents: AgentLocationWire[] }
  | { type: 'location.batch'; ts: string; agents: AgentLocationWire[] }
  | { type: 'agent.offline'; agent_id: string; ts: string }
  | { type: 'heartbeat'; ts: string };

// ─── Meets (GET /api/meets/active, POST /api/meets, etc.) ───

export type MeetStatus = 'pending_location' | 'scheduled' | 'active' | 'completed' | 'cancelled';

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
  created_at: string;
  updated_at: string;
  participant_count?: number;
};

export type MeetParticipant = {
  meet_id: string;
  user_id: string;
  full_name: string;
  role: string;
  joined_at: string;
  left_at: string | null;
};

export type CreateMeetPayload = {
  campaign_id: string;
  title: string;
  description?: string;
  location_name?: string;
  lat?: number;
  lng?: number;
  starts_at: string;
  ends_at?: string;
};

// ─── Campaign Members (GET /api/campaigns/:id/members) ──────

export type CampaignMember = {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  region: string | null;
  role: UserRole;
  user_status: string;
};

// ─── Meet Summary (GET /api/meets/:id/summary) ─────────────

export type MeetSummary = Meet & {
  active_participants: number;
  forms_count: number;
};

// ─── API Response wrapper ───────────────────────────────────

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string; code?: string; status?: number; passwordResetRequired?: boolean };
export type ApiResult<T> = ApiOk<T> | ApiErr;

// ─── Invitations (GET /api/invitations/validate/:code — public) ─────

export type InvitationInfo = {
  campaign_id: string;
  campaign_name: string;
  campaign_slug: string;
  role: string;
};

export type ValidateInvitationResponse = {
  invitation: InvitationInfo;
};

/** Extended register payload that includes an invitation code */
export type RegisterWithCodeRequest = RegisterRequest & {
  invitation_code: string;
};

// ─── Access Codes (GET /api/access-codes/validate/:code — public) ────

/** Respuesta de validar un codigo de acceso de campana (4 chars) */
export type ValidateAccessCodeResponse = {
  campaign: {
    id: string;
    name: string;
    slug: string;
  };
};

/** Extended register payload that uses a campaign access code (4 chars) */
export type RegisterWithAccessCodeRequest = RegisterRequest & {
  access_code: string;
};

// ─── API Error codes ────────────────────────────────────────

// ─── Geo Hierarchy ──────────────────────────────────────────

export type GeoBounds = [[number, number], [number, number]];

export type DepartamentoInfo = {
  coddep: string;
  departamento: string;
  bounds: GeoBounds;
};

export type ProvinciaInfo = {
  coddep: string;
  codprov: string;
  codprov_full: string;
  provincia: string;
  bounds: GeoBounds;
};

export type DistritoInfo = {
  coddep: string;
  codprov_full: string;
  ubigeo: string;
  distrito: string;
  bounds: GeoBounds;
};

/** Selected location from the distrito picker */
export type SelectedDistrito = {
  ubigeo: string;
  distrito: string;
  provincia: string;
  departamento: string;
  codprov_full: string;
  coddep: string;
};

export const API_ERRORS = {
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_USER_PENDING: 'AUTH_USER_PENDING',
  AUTH_USER_SUSPENDED: 'AUTH_USER_SUSPENDED',
  AUTH_EMAIL_EXISTS: 'AUTH_EMAIL_EXISTS',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
} as const;

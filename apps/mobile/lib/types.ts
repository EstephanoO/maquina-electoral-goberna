/**
 * Tipos compartidos para toda la app Expo.
 * Estos tipos definen el contrato con el backend real en 161.132.39.165.
 * Si el backend cambia, este archivo cambia y TypeScript te dice que se rompio.
 *
 * Backend contracts verified 2026-02-16 against live VPS.
 */

// ─── Auth ───────────────────────────────────────────────────

/** Backend roles: admin | supervisor | agent */
export type UserRole = 'agent' | 'supervisor' | 'admin';
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
  email: string;
  password: string;
};

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
  campaigns: CampaignMembership[];
};

/** Backend expects: { email, password, full_name } */
export type RegisterRequest = {
  email: string;
  password: string;
  full_name: string;
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

/** PUT /api/access-requests/:id expects: { status: 'approved' | 'rejected', note? } */
export type ResolveAccessRequestPayload = {
  status: 'approved' | 'rejected';
  note?: string;
};

export type AccessRequestRow = {
  id: string;
  user_id: string;
  campaign_id: string;
  status: 'pending' | 'approved' | 'rejected';
  full_name: string;
  email: string;
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

// ─── API Response wrapper ───────────────────────────────────

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string; code?: string; status?: number };
export type ApiResult<T> = ApiOk<T> | ApiErr;

// ─── API Error codes ────────────────────────────────────────

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

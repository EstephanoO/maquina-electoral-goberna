/**
 * API client centralizado.
 * Todas las llamadas al backend pasan por aca.
 *
 * Responsabilidades:
 * - Adjuntar Authorization header automaticamente
 * - Refresh automatico cuando access token expira
 * - Adjuntar x-campaign-id header cuando hay campana activa
 * - Wrapper Result<T> para manejo de errores consistente
 *
 * Backend: https://api.goberna.us/api (VPS via Cloudflare, HTTPS)
 */

import Constants from 'expo-constants';

import {
  getAccessToken,
  clearAuthData,
  getActiveCampaignId,
  refreshTokens,
} from './auth-store';

import type {
  ApiResult,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  RegisterWithCodeRequest,
  ValidateInvitationResponse,
  ValidateAccessCodeResponse,
  RegisterWithAccessCodeRequest,
  CandidateInfo,
  CampaignConfig,
  FormDefinition,
  FormSubmissionPayload,
  AccessRequestRow,
  CreateAccessRequestPayload,
  ResolveAccessRequestPayload,
  AuthUser,
  CampaignMembership,
  JoinCampaignResponse,
  WhatsappAuthResponse,
  WhatsappRegisterRequest,
  WhatsappSendResponse,
  Meet,
  MeetSummary,
  MeetParticipant,
  CampaignMember,
  CreateMeetPayload,
  DepartamentoInfo,
  ProvinciaInfo,
  DistritoInfo,
  SelectedDistrito,
} from './types';

// ─── Config ─────────────────────────────────────────────────
// Read from app.json extras, fallback to api.goberna.us
const API_BASE =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_API_URL ??
  'https://api.goberna.us/api';

const AGENT_INGEST_TOKEN =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_AGENT_INGEST_TOKEN ?? '';

// Timeout for API calls (Peru has intermittent connectivity)
const API_TIMEOUT_MS = 30_000; // 30 seconds

export { API_BASE, AGENT_INGEST_TOKEN };

// ─── HTTP helpers ───────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  auth = true,
): Promise<ApiResult<T>> {
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {};

    // Only set Content-Type when there IS a body — Fastify rejects
    // Content-Type: application/json with an empty/undefined body.
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (auth) {
      const token = await getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Attach active campaign_id for scoped endpoints
      const campaignId = await getActiveCampaignId();
      if (campaignId) {
        headers['x-campaign-id'] = campaignId;
      }
    }

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    // Token expired → try refresh
    if (response.status === 401 && auth) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        // Retry original request with new token
        return request<T>(method, path, body, auth);
      }
      // Refresh failed → force logout
      await clearAuthData();
      return {
        ok: false,
        error: 'Sesion expirada. Inicia sesion nuevamente.',
        code: 'AUTH_TOKEN_EXPIRED',
        status: 401,
      };
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({
        code: 'UNKNOWN',
        message: 'Error desconocido',
      }));
      return {
        ok: false,
        error: errorBody.message ?? 'Error del servidor',
        code: errorBody.code,
        status: response.status,
      };
    }

    // 204 No Content
    if (response.status === 204) {
      return { ok: true, data: undefined as T };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (error) {
    // Handle timeout specifically
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, error: 'Tiempo de espera agotado. Verifica tu conexion.' };
    }
    const message = error instanceof Error ? error.message : 'Error de red';
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Delegate to shared auth-store implementation (deduplication + timeout handled there)
function tryRefresh(): Promise<boolean> {
  return refreshTokens(API_BASE);
}

// ─── Auth endpoints (no auth header needed) ─────────────────

export async function login(body: LoginRequest): Promise<ApiResult<LoginResponse>> {
  return request<LoginResponse>('POST', '/auth/login', body, false);
}

export async function register(body: RegisterRequest): Promise<ApiResult<RegisterResponse>> {
  return request<RegisterResponse>('POST', '/auth/register', body, false);
}

// ─── WhatsApp OTP (sin password, código por WhatsApp) ───────

/**
 * POST /api/auth/whatsapp/send — pide al backend que dispare un OTP por
 * WhatsApp al número. Rate-limited 1/60s por número en Redis.
 */
export async function whatsappSend(phone: string): Promise<ApiResult<WhatsappSendResponse>> {
  return request<WhatsappSendResponse>('POST', '/auth/whatsapp/send', { phone }, false);
}

/**
 * POST /api/auth/whatsapp/verify — login: valida phone+code y emite JWT.
 * Si el user no existe responde 412 USER_NOT_FOUND, el cliente debe redirigir
 * a register.
 */
export async function whatsappVerifyLogin(
  phone: string,
  code: string,
): Promise<ApiResult<WhatsappAuthResponse>> {
  return request<WhatsappAuthResponse>('POST', '/auth/whatsapp/verify', { phone, code }, false);
}

/**
 * POST /api/auth/whatsapp/register — registro completo: valida phone+code,
 * crea user + user_campaign como agente_campo, emite JWT. Exactly one of
 * {invitation_code, access_code, campaign_id} debe estar presente.
 */
export async function whatsappRegister(
  body: WhatsappRegisterRequest,
): Promise<ApiResult<WhatsappAuthResponse>> {
  return request<WhatsappAuthResponse>('POST', '/auth/whatsapp/register', body, false);
}

/**
 * POST /api/auth/join-campaign — para users ya autenticados que cayeron en
 * needs_campaign (verify OK pero sin campaigns asignadas). Crea/reactiva
 * user_campaign como agente_campo y devuelve user + campaigns actualizado.
 */
export async function joinCampaign(
  accessCode: string,
): Promise<ApiResult<JoinCampaignResponse>> {
  return request<JoinCampaignResponse>('POST', '/auth/join-campaign', { access_code: accessCode }, true);
}

/**
 * POST /api/auth/logout — revokes all refresh tokens for this user on the server.
 * Accepts an optional AbortSignal so the caller can enforce a timeout.
 * Best-effort: the local session is cleared regardless of whether this succeeds.
 */
export async function logout(signal?: AbortSignal): Promise<ApiResult<void>> {
  const token = await getAccessToken();
  if (!token) return { ok: true, data: undefined };
  try {
    const response = await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!response.ok) return { ok: false, error: 'Logout server error', status: response.status };
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: 'Network error during logout' };
  }
}

// ─── Invitations ────────────────────────────────────────────

/**
 * GET /api/invitations/validate/:code — public, no auth needed.
 * Validates an invitation code and returns campaign info.
 */
export async function validateInvitation(
  code: string,
): Promise<ApiResult<ValidateInvitationResponse>> {
  return request<ValidateInvitationResponse>(
    'GET',
    `/invitations/validate/${encodeURIComponent(code)}`,
    undefined,
    false,
  );
}

/**
 * POST /api/auth/register — register a new user with an invitation code.
 * The invitation_code is validated and consumed server-side.
 */
export async function registerWithInvitation(
  body: RegisterWithCodeRequest,
): Promise<ApiResult<RegisterResponse>> {
  return request<RegisterResponse>('POST', '/auth/register', body, false);
}

// ─── Access Codes ────────────────────────────────────────────

/**
 * GET /api/access-codes/validate/:code — public, no auth needed.
 * Validates a 4-char campaign access code and returns campaign info.
 * Used to pre-fill campaign info before registration.
 */
export async function validateAccessCode(
  code: string,
): Promise<ApiResult<ValidateAccessCodeResponse>> {
  return request<ValidateAccessCodeResponse>(
    'GET',
    `/access-codes/validate/${encodeURIComponent(code.toUpperCase())}`,
    undefined,
    false,
  );
}

/**
 * POST /api/auth/register — register a new user with a 4-char campaign access code.
 * The access_code is validated server-side; campaign_id is resolved from the code.
 */
export async function registerWithAccessCode(
  body: RegisterWithAccessCodeRequest,
): Promise<ApiResult<RegisterResponse>> {
  return request<RegisterResponse>('POST', '/auth/register', body, false);
}

/** GET /api/auth/me — returns { user, campaigns } */
export async function getMe(): Promise<
  ApiResult<{ user: AuthUser; campaigns: CampaignMembership[] }>
> {
  return request<{ user: AuthUser; campaigns: CampaignMembership[] }>('GET', '/auth/me');
}

// ─── Candidates (public) ────────────────────────────────────

/** GET /api/candidates — public list of active candidates/campaigns */
export async function getCandidates(): Promise<ApiResult<{ candidates: CandidateInfo[] }>> {
  return request<{ candidates: CandidateInfo[] }>('GET', '/candidates', undefined, false);
}

// ─── Campaigns ──────────────────────────────────────────────

/** GET /api/campaigns/:id — requires auth + campaign membership */
export async function getCampaign(campaignId: string): Promise<ApiResult<{ campaign: CampaignConfig }>> {
  return request<{ campaign: CampaignConfig }>('GET', `/campaigns/${campaignId}`);
}

// ─── Form Definitions ───────────────────────────────────────

/** GET /api/form-definitions/active?campaign_id=X — requires auth */
export async function getActiveFormDefinitions(
  campaignId: string,
): Promise<ApiResult<{ form_definitions: FormDefinition[] }>> {
  return request<{ form_definitions: FormDefinition[] }>(
    'GET',
    `/form-definitions/active?campaign_id=${campaignId}`,
  );
}

// ─── Form Submission ────────────────────────────────────────

/** POST /api/forms — requires auth + campaign. Returns { accepted, deduped, queue_depth } */
export async function submitForm(
  payload: FormSubmissionPayload,
): Promise<ApiResult<{ accepted: number; deduped: number; queue_depth: number }>> {
  return request<{ accepted: number; deduped: number; queue_depth: number }>(
    'POST',
    '/forms',
    payload,
  );
}

// ─── Form QR Drafts (post-submit QR para el entrevistado) ────

export type CreateFormQrDraftPayload = {
  /** UUID local — el mismo client_id del form queue. Idempotente. */
  client_id: string;
  /** ID del form definition (para que el backend asocie el form_submission). */
  form_definition_id?: string | null;
  /** Data del form como llave-valor — backend hace el INSERT en form_submissions. */
  data: Record<string, unknown>;
  /** Coords opcionales (decimal) */
  lat?: number | null;
  lng?: number | null;
};

/**
 * POST /api/form-qr-drafts
 * Crea un draft QR para que el entrevistado escanee. Backend responde con
 * token + qr_url (`/api/q/<token>`). Cuando el entrevistado escanea ese URL,
 * el backend redirige a wa.me/<candidato_number>?text=<mensaje> con tokens
 * resueltos, y persiste el form_submission asociado al draft.
 */
export async function createFormQrDraft(
  payload: CreateFormQrDraftPayload,
): Promise<ApiResult<{ token: string; qr_url: string; expires_at: string }>> {
  return request<{ token: string; qr_url: string; expires_at: string }>(
    'POST',
    '/form-qr-drafts',
    payload,
  );
}

// ─── Phone duplicate check ──────────────────────────────────

/**
 * GET /api/forms/check-phone?phone=999888777
 * Returns { exists: boolean } — true if this phone already exists
 * in form_submissions for the active campaign.
 * Used by the form screen to block submission of duplicate phones.
 */
export async function checkPhoneDuplicate(
  phone: string,
): Promise<ApiResult<{ exists: boolean; phone: string }>> {
  return request<{ exists: boolean; phone: string }>(
    'GET',
    `/forms/check-phone?phone=${encodeURIComponent(phone)}`,
  );
}

// ─── Access Requests ────────────────────────────────────────

/** POST /api/access-requests — authenticated user requests access to a campaign */
export async function createAccessRequest(
  body: CreateAccessRequestPayload,
): Promise<ApiResult<{ access_request: AccessRequestRow }>> {
  return request<{ access_request: AccessRequestRow }>('POST', '/access-requests', body);
}

/** GET /api/access-requests/mine — user sees own requests */
export async function getMyAccessRequests(): Promise<
  ApiResult<{ access_requests: AccessRequestRow[] }>
> {
  return request<{ access_requests: AccessRequestRow[] }>('GET', '/access-requests/mine');
}

/** GET /api/access-requests/pending — admin sees pending requests */
export async function getPendingAccessRequests(): Promise<
  ApiResult<{ pending_requests: AccessRequestRow[] }>
> {
  return request<{ pending_requests: AccessRequestRow[] }>('GET', '/access-requests/pending');
}

/** PUT /api/access-requests/:id — admin resolves request with { status, note? } */
export async function resolveAccessRequest(
  id: string,
  body: ResolveAccessRequestPayload,
): Promise<ApiResult<{ access_request: AccessRequestRow }>> {
  return request<{ access_request: AccessRequestRow }>('PUT', `/access-requests/${id}`, body);
}

// ─── Meets ──────────────────────────────────────────────────

/** GET /api/meets/active — requires auth + x-campaign-id */
export async function getActiveMeets(): Promise<ApiResult<{ meets: Meet[] }>> {
  return request<{ meets: Meet[] }>('GET', '/meets/active');
}

/** POST /api/meets — create a new meet */
export async function createMeet(body: CreateMeetPayload): Promise<ApiResult<{ meet: Meet }>> {
  return request<{ meet: Meet }>('POST', '/meets', body);
}

/** POST /api/meets/:id/join — join a meet */
export async function joinMeet(meetId: string): Promise<ApiResult<{ ok: boolean }>> {
  return request<{ ok: boolean }>('POST', `/meets/${meetId}/join`);
}

/** POST /api/meets/:id/leave — leave a meet */
export async function leaveMeet(meetId: string): Promise<ApiResult<{ ok: boolean }>> {
  return request<{ ok: boolean }>('POST', `/meets/${meetId}/leave`);
}

/** DELETE /api/meets/:id — delete a meet (admin/supervisor only) */
export async function deleteMeet(meetId: string): Promise<ApiResult<{ ok: boolean }>> {
  return request<{ ok: boolean }>('DELETE', `/meets/${meetId}`);
}

/** GET /api/meets/:id/summary — meet detail with participants + form count */
export async function getMeetSummary(
  meetId: string,
): Promise<ApiResult<{ meet: MeetSummary; participants: MeetParticipant[] }>> {
  return request<{ meet: MeetSummary; participants: MeetParticipant[] }>(
    'GET',
    `/meets/${meetId}/summary`,
  );
}

/** GET /api/meets/:id/participants — list participants of a meet */
export async function getMeetParticipants(
  meetId: string,
): Promise<ApiResult<{ participants: MeetParticipant[] }>> {
  return request<{ participants: MeetParticipant[] }>('GET', `/meets/${meetId}/participants`);
}

// ─── Campaign Members ───────────────────────────────────────

/** GET /api/campaigns/:id/members — list team members (admin/supervisor only) */
export async function getCampaignMembers(
  campaignId: string,
): Promise<ApiResult<{ members: CampaignMember[] }>> {
  return request<{ members: CampaignMember[] }>('GET', `/campaigns/${campaignId}/members`);
}

/** PUT /api/campaigns/:id/members/:userId/role — change member role (admin/jefe_campana only) */
export async function updateMemberRole(
  campaignId: string,
  userId: string,
  role: string,
): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>('PUT', `/campaigns/${campaignId}/members/${userId}/role`, { role });
}

// ─── Form Submission Stats ───────────────────────────────────

/**
 * GET /api/form-submissions/my-stats
 * Returns server-side submission counts for the authenticated agent.
 * Used by the mobile dashboard so the total shown reflects all submissions
 * ever synced to the server, not just what remains in local SQLite.
 */
export function getMySubmissionStats(): Promise<ApiResult<{
  stats: { total: number; today: number; week: number };
}>> {
  return request('GET', '/form-submissions/my-stats');
}

/**
 * GET /api/form-submissions/my-client-ids
 * Returns the list of client_ids that the server has persisted for this agent.
 * Used for reconciliation: detect local "synced" forms the server dropped.
 */
export function getMyClientIds(): Promise<ApiResult<{
  client_ids: string[];
}>> {
  return request('GET', '/form-submissions/my-client-ids');
}

/**
 * GET /api/form-submissions/my-stats/ranking
 * Returns a ranking of agents within the requesting agent's department.
 * Department is auto-detected from the agent's most frequent submission location.
 */
export function getMyDeptRanking(): Promise<ApiResult<{
  departamento: string | null;
  my_position: number;
  my_count: number;
  total_agents: number;
  ranking: Array<{ id: string; name: string; count: number; today: number }>;
}>> {
  return request('GET', '/form-submissions/my-stats/ranking');
}

/**
 * GET /api/form-submissions/my-stats/departments
 * Returns all departments ranked by total unique phone registrations.
 */
export function getDepartmentsRanking(): Promise<ApiResult<{
  departments: Array<{ departamento: string; total: number; today: number; agents: number }>;
}>> {
  return request('GET', '/form-submissions/my-stats/departments');
}

// ─── Geo Hierarchy (public, no auth) ────────────────────────

/** GET /api/geo/departamentos — list all 25 departments. Cached 24h server-side. */
export async function getGeoDepartamentos(): Promise<ApiResult<{ departamentos: DepartamentoInfo[] }>> {
  return request('GET', '/geo/departamentos', undefined, false);
}

/** GET /api/geo/departamentos/:coddep/provincias — provinces of a department. */
export async function getGeoProvincias(coddep: string): Promise<ApiResult<{ provincias: ProvinciaInfo[] }>> {
  return request('GET', `/geo/departamentos/${coddep}/provincias`, undefined, false);
}

/** GET /api/geo/provincias/:codprov_full/distritos — districts of a province. */
export async function getGeoDistritos(codprov_full: string): Promise<ApiResult<{ distritos: DistritoInfo[] }>> {
  return request('GET', `/geo/provincias/${codprov_full}/distritos`, undefined, false);
}

/** GET /api/geo/distritos/all — flat list of all ~1900 distritos (for offline cache preload). */
export async function getGeoAllDistritos(): Promise<ApiResult<{ distritos: SelectedDistrito[]; count: number }>> {
  return request('GET', '/geo/distritos/all', undefined, false);
}

/** GET /api/geo/distritos/search?q=&limit= — search distritos by name (online). */
export async function searchGeoDistritos(q: string, limit = 20): Promise<ApiResult<{ results: SelectedDistrito[]; count: number }>> {
  return request('GET', `/geo/distritos/search?q=${encodeURIComponent(q)}&limit=${limit}`, undefined, false);
}

// ─── GPS Tracking ───────────────────────────────────────────

/** POST /api/agents/location — uses x-agent-token header (NOT JWT) */
export async function sendLocation(payload: {
  agent_id: string;
  ts: string;
  lat: number;
  lng: number;
  seq: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  battery?: number;
  campaign_id?: string;
}): Promise<ApiResult<{ accepted: boolean }>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/agents/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-token': AGENT_INGEST_TOKEN,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({
        code: 'UNKNOWN',
        message: 'Error de tracking',
      }));
      return { ok: false, error: errorBody.message ?? 'Error de tracking', status: response.status };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, error: 'Tiempo de espera agotado' };
    }
    const message = error instanceof Error ? error.message : 'Error de red';
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── QR Leads ────────────────────────────────────────────────

/**
 * POST /api/qr-leads/scan
 * Records that someone scanned the brigadista's QR and opened WA.
 * brigadista_id = JWT userId (server-side). campaign_id = x-campaign-id header.
 */
export function recordQrScan(params?: {
  phone?: string;
  message_text?: string;
  scan_source?: 'qr' | 'link' | 'manual';
}): Promise<ApiResult<{ id: string; scanned_at: string }>> {
  return request('POST', '/qr-leads/scan', params ?? { scan_source: 'qr' });
}

/**
 * GET /api/qr-leads/my-stats
 * Returns total / today / this_week scan counts for the current brigadista.
 */
export function getMyQrStats(): Promise<ApiResult<{
  stats: { total: number; today: number; this_week: number };
}>> {
  return request('GET', '/qr-leads/my-stats');
}

/**
 * POST /api/qr-leads/codes
 * Creates a scan code for QR auto-detection. Returns { code }.
 */
export function createQrCode(redirectUrl: string): Promise<ApiResult<{ code: string }>> {
  return request('POST', '/qr-leads/codes', { redirect_url: redirectUrl });
}

/**
 * GET /api/qr-leads/codes/:code/status
 * Check if a scan code has been scanned.
 */
export function checkQrCodeStatus(code: string): Promise<ApiResult<{ scanned: boolean; scanned_at: string | null }>> {
  return request('GET', `/qr-leads/codes/${code}/status`);
}

/**
 * POST /api/qr-trackers/my-qr
 * Returns (or creates) the brigadista's static QR tracker.
 */
export function getMyStaticQr(targetUrl: string): Promise<ApiResult<{
  slug: string;
  scan_count: number;
  redirect_url: string;
}>> {
  return request('POST', '/qr-trackers/my-qr', { target_url: targetUrl });
}

/** CRM backend API client */

import { CONFIG } from "./config.js";

async function request<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (CONFIG.apiToken) headers["Authorization"] = `Bearer ${CONFIG.apiToken}`;
  const res = await fetch(`${CONFIG.apiUrl}${path}`, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text}`);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

export interface Lead {
  id: number;
  name: string;
  phone: string | null;
  stage: string;
  country: string | null;
  buyer_tier: string | null;
  interests: string[];
  course: string | null;
}

export interface RecordMessageResult {
  lead: Lead;
  interaction: { id: number } | null;
  /** Sprint 2 hotfix F2: timestamp ISO del último message_out manual del
   *  operador en últimos 10 min. Si presente, el bot NO debe disparar
   *  auto-reply — está activa una conversación humana. */
  recent_manual_out_at: string | null;
  /** Sprint 2 hotfix F6: count de message_in/out anteriores al recién
   *  insertado. 0 = lead nuevo (primer contacto). El bot solo responde
   *  a leads nuevos hasta que el cascade esté más afinado. */
  prior_msg_count: number;
}

export interface AiSuggestion {
  id: number;
  lead_id: number;
  trigger_body: string;
  intent: string;
  product: string | null;
  sentiment: string;
  urgency: string;
  language: string;
  body: string;
  confidence: number;
  status: string;
  created_at: string;
}

export interface AiGenerateResult {
  ok: boolean;
  suggestion: AiSuggestion;
}

export const crmApi = {
  health: () => request("/health"),

  recordMessage: (data: {
    phone: string;
    name?: string;
    direction: "in" | "out";
    body: string;
    assigned_to?: string;
    timestamp?: string;
    external_id?: string;
    // meta JSONB para info estructurada — el backend guarda esto en
    // interactions.meta y el frontend de leads-crm lo usa para renderizar
    // tipos ricos (imagen/audio/video/doc/sticker/reaction). Audit 2026-05-06.
    meta?: Record<string, unknown> | null;
  }) => {
    // El API (db.recordMessage) espera el campo `kind`, no `direction`.
    // Si no traduce acá, el server cae al default "message_in" y los
    // outbound terminan guardados como inbound. Bug detectado 2026-04-28
    // tras fix de fromMe en wa-instance.ts.
    const { direction, ...rest } = data;
    return request<RecordMessageResult>("/messages", {
      method: "POST",
      body: JSON.stringify({
        ...rest,
        kind: direction === "out" ? "message_out" : "message_in",
      }),
    });
  },

  getLeadByPhone: (phone: string) =>
    request<Lead>(`/leads/by-phone/${encodeURIComponent(phone)}`).catch(() => null),

  updateLead: (id: number, patch: Record<string, unknown>) =>
    request<Lead>(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  addInteraction: (leadId: number, data: { kind: string; body?: string; by?: string; meta?: unknown }) =>
    request(`/leads/${leadId}/interactions`, { method: "POST", body: JSON.stringify(data) }),

  aiGenerate: (leadId: number, message: string, context?: string) =>
    request<AiGenerateResult>("/ai/generate", {
      method: "POST",
      body: JSON.stringify({ leadId, message, context }),
    }),
};

// ═══════════════════════════════════════════════════════════════════════
// ELECTORAL DUAL-PUSH (Fase 1 del UNIFICATION_PLAN, 2026-05-06).
//
// El bot empuja eventos en paralelo a leads-crm-api (acima) Y a electoral
// cuando el `own_number` está registrado en wa_phones de alguna campaign
// electoral. Fire-and-forget: si electoral falla, leads-crm sigue intacto.
//
// Refresh del mapping cada 60s vía GET /api/cms/active-wa-phones.
// ═══════════════════════════════════════════════════════════════════════

export type ElectoralPhoneMapping = { number: string; campaign_id: string; campaign_slug: string };

let electoralPhones: Map<string, ElectoralPhoneMapping> = new Map();
let lastPhoneSync = 0;
const ELECTORAL_PHONE_SYNC_MS = 60_000;

/** Devuelve el campaign_id si `own_number` está mapeado a una campaña electoral, o null. */
export function getElectoralCampaignFor(ownNumber: string): ElectoralPhoneMapping | null {
  return electoralPhones.get(ownNumber) ?? null;
}

export async function syncElectoralPhones(): Promise<void> {
  if (!CONFIG.electoralBotSecret) return;
  if (Date.now() - lastPhoneSync < ELECTORAL_PHONE_SYNC_MS) return;
  lastPhoneSync = Date.now();
  try {
    const res = await fetch(`${CONFIG.electoralApiUrl}/api/cms/active-wa-phones`, {
      headers: { "X-Bot-Secret": CONFIG.electoralBotSecret },
    });
    if (!res.ok) return;
    const json = await res.json() as {
      phones?: Array<{ number: string; campaign_id: string; campaign_slug: string }>;
    };
    const phones = json.phones ?? [];
    electoralPhones = new Map(phones.map((p) => [p.number, p]));
    console.log(`[bot] electoral phones synced: ${electoralPhones.size}`);
  } catch (e: any) {
    console.warn(`[bot] electoral phones sync failed: ${e?.message ?? e}`);
  }
}

export type ElectoralWaEvent = {
  campaign_id: string;
  own_number: string;
  jid: string;
  phone?: string;
  contact_name?: string;
  direction: "in" | "out";
  text: string;
  timestamp?: number;
  external_id?: string;
  operator_id?: string;
  operator_name?: string;
  message_type?: string;
  media_url?: string;
  media_mime?: string;
  media_size_bytes?: number;
  media_caption?: string;
  media_duration_sec?: number;
  is_group?: boolean;
  group_subject?: string;
  sender_jid?: string;
  sender_name?: string;
  reaction_to_external_id?: string;
  reaction_emoji?: string;
  quoted_external_id?: string;
};

/** Empuja un evento al backend electoral. Fire-and-forget — nunca tira. */
export async function pushElectoralEvent(event: Omit<ElectoralWaEvent, "campaign_id">): Promise<void> {
  if (!CONFIG.electoralBotSecret) return;
  const mapping = electoralPhones.get(event.own_number);
  if (!mapping) return; // own_number no está mapeado a electoral
  try {
    const res = await fetch(`${CONFIG.electoralApiUrl}/api/cms/wa-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bot-Secret": CONFIG.electoralBotSecret },
      body: JSON.stringify({ ...event, campaign_id: mapping.campaign_id }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(`[bot] electoral push failed ${res.status}: ${txt.slice(0, 120)}`);
    }
  } catch (e: any) {
    console.warn(`[bot] electoral push error: ${e?.message ?? e}`);
  }
}

/** Sube un binario media al backend electoral. Devuelve URL pública o null. */
export async function uploadMediaToElectoral(
  buffer: Buffer,
  mime: string,
  campaignId: string,
): Promise<{ url: string; size_bytes: number } | null> {
  if (!CONFIG.electoralBotSecret) return null;
  try {
    const res = await fetch(`${CONFIG.electoralApiUrl}/api/cms/wa-media`, {
      method: "POST",
      headers: {
        "Content-Type": mime,
        "X-Bot-Secret": CONFIG.electoralBotSecret,
        "X-Campaign-Id": campaignId,
      },
      // Node 20 fetch acepta Buffer/Uint8Array en runtime, pero los tipos de
      // BodyInit del lib.dom de TS no lo declaran. Cast a `any` para evitar
      // la incompatibilidad sin perder tipos en el resto.
      body: buffer as unknown as BodyInit,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(`[bot] electoral media upload failed ${res.status}: ${txt.slice(0, 120)}`);
      return null;
    }
    const json = await res.json() as { url?: string; size_bytes?: number };
    if (!json.url) return null;
    return { url: json.url, size_bytes: json.size_bytes ?? buffer.length };
  } catch (e: any) {
    console.warn(`[bot] electoral media upload error: ${e?.message ?? e}`);
    return null;
  }
}

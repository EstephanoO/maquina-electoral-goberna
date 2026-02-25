/**
 * GOBERNA — Twilio WhatsApp Service
 *
 * Lee las credenciales Twilio de campaigns.config (por campaña),
 * cifradas con AES-256-GCM. No depende de variables de entorno Twilio.
 *
 * Si la campaña no tiene credenciales configuradas → modo mock (guarda
 * en DB pero no llama a Twilio), útil para desarrollo.
 */

import twilio from "twilio";
import { pool } from "../../db";
import { decrypt } from "../../infra/crypto";
import type { MessageStatus, TwilioMessage } from "./twilio.types";

// ── Campaign Twilio config ───────────────────────────────────────────

type CampaignTwilioConfig = {
  accountSid: string;
  authToken: string;
  from: string;
  messagingServiceSid?: string;
};

/**
 * Reads and decrypts Twilio credentials from campaigns.config JSONB.
 * Returns null if the campaign has no Twilio config set.
 */
async function getCampaignTwilioConfig(
  campaignId: string,
): Promise<CampaignTwilioConfig | null> {
  const res = await pool.query<{ config: Record<string, unknown> }>(
    `SELECT config FROM campaigns WHERE id = $1`,
    [campaignId],
  );
  const campaign = res.rows[0];
  if (!campaign) return null;

  const twilioCfg = (campaign.config?.twilio ?? {}) as {
    account_sid?: string;
    auth_token?: string;
    whatsapp_from?: string;
    messaging_service_sid?: string;
  };

  if (!twilioCfg.account_sid || !twilioCfg.auth_token || !twilioCfg.whatsapp_from) {
    return null;
  }

  let authToken: string;
  try {
    authToken = decrypt(twilioCfg.auth_token);
  } catch {
    return null; // Corrupted or key mismatch — treat as not configured
  }

  return {
    accountSid: twilioCfg.account_sid,
    authToken,
    from: twilioCfg.whatsapp_from,
    messagingServiceSid: twilioCfg.messaging_service_sid || undefined,
  };
}

// ── Send outbound WhatsApp message ───────────────────────────────────

export type SendResult =
  | { ok: true; message: TwilioMessage }
  | { ok: false; error: string };

export async function sendWhatsAppMessage(params: {
  contactId: string;
  campaignId: string;
  toPhone: string;
  body: string;
  sentBy: string;
}): Promise<SendResult> {
  const { contactId, campaignId, toPhone, body, sentBy } = params;

  if (!toPhone) {
    return { ok: false, error: "El contacto no tiene número de teléfono registrado" };
  }

  const normalizedPhone = normalizePhone(toPhone);
  const toWhatsApp = `whatsapp:${normalizedPhone}`;

  const cfg = await getCampaignTwilioConfig(campaignId);

  if (!cfg) {
    // Mock mode — campaign has no Twilio credentials configured
    const row = await insertMessage({
      contactId,
      campaignId,
      direction: "outbound",
      body,
      twilioSid: null,
      status: "queued",
      sentBy,
    });
    return { ok: true, message: row };
  }

  try {
    const client = twilio(cfg.accountSid, cfg.authToken);
    // Prefer MessagingServiceSid for WhatsApp Business senders;
    // fall back to direct from for sandbox/legacy setups.
    const msg = await client.messages.create(
      cfg.messagingServiceSid
        ? { messagingServiceSid: cfg.messagingServiceSid, to: toWhatsApp, body }
        : { from: cfg.from, to: toWhatsApp, body },
    );

    const row = await insertMessage({
      contactId,
      campaignId,
      direction: "outbound",
      body,
      twilioSid: msg.sid,
      status: mapTwilioStatus(msg.status),
      sentBy,
    });

    return { ok: true, message: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error enviando mensaje via Twilio";
    return { ok: false, error: message };
  }
}

// ── Handle incoming webhook ──────────────────────────────────────────

export type WebhookResult =
  | { ok: true; type: "inbound"; message: TwilioMessage }
  | { ok: true; type: "status_update"; sid: string; status: MessageStatus }
  | { ok: true; type: "unknown" }
  | { ok: false; error: string };

export async function handleTwilioWebhook(params: {
  messageSid: string;
  messageStatus?: string;
  body?: string;
  from?: string;
  to?: string;
}): Promise<WebhookResult> {
  const { messageSid, messageStatus, body, from } = params;

  // Status update — no body from citizen
  if (messageStatus && !body) {
    const status = mapTwilioStatus(messageStatus);
    await pool.query(
      `UPDATE cms_twilio_messages SET status = $1 WHERE twilio_sid = $2`,
      [status, messageSid],
    );
    return { ok: true, type: "status_update", sid: messageSid, status };
  }

  // Inbound message from citizen
  if (body && from) {
    const normalizedFrom = normalizePhone(from.replace("whatsapp:", ""));
    // Strip country code for flexible matching — DB may store "955135507" or "51955135507"
    const phoneDigits = normalizedFrom.replace("+", "");
    const phoneLocal = phoneDigits.startsWith("51") ? phoneDigits.slice(2) : phoneDigits;

    // First try: correlate via previous outbound message to same phone
    const existing = await pool.query<{ contact_id: string; campaign_id: string }>(
      `SELECT m.contact_id, m.campaign_id
       FROM cms_twilio_messages m
       JOIN form_submissions fs ON fs.id = m.contact_id
       WHERE (COALESCE(fs.data->>'telefono', '') = $1
              OR COALESCE(fs.data->>'telefono', '') = $2)
         AND m.direction = 'outbound'
       ORDER BY m.created_at DESC
       LIMIT 1`,
      [phoneDigits, phoneLocal],
    );

    // Fallback: find contact by phone even without previous outbound message
    if (existing.rows.length === 0) {
      const fallback = await pool.query<{ id: string; campaign_id: string }>(
        `SELECT id, campaign_id
         FROM form_submissions
         WHERE COALESCE(data->>'telefono', '') IN ($1, $2)
         ORDER BY created_at DESC
         LIMIT 1`,
        [phoneDigits, phoneLocal],
      );

      if (fallback.rows.length > 0 && fallback.rows[0]) {
        const { id: contact_id, campaign_id } = fallback.rows[0];
        const row = await insertMessage({
          contactId: contact_id,
          campaignId: campaign_id,
          direction: "inbound",
          body,
          twilioSid: messageSid,
          status: "received",
          sentBy: null,
        });
        return { ok: true, type: "inbound", message: row };
      }
    }

    if (existing.rows.length === 0 || !existing.rows[0]) {
      return { ok: true, type: "unknown" };
    }

    const { contact_id, campaign_id } = existing.rows[0];

    const row = await insertMessage({
      contactId: contact_id,
      campaignId: campaign_id,
      direction: "inbound",
      body,
      twilioSid: messageSid,
      status: "received",
      sentBy: null,
    });

    return { ok: true, type: "inbound", message: row };
  }

  return { ok: true, type: "unknown" };
}

// ── Validate Twilio webhook signature ────────────────────────────────
// Uses the auth token from the campaign that owns the Twilio number.
//
// For INBOUND messages:   To = Twilio number, From = citizen
// For STATUS callbacks:   To = citizen,       From = Twilio number
//
// We try To first (inbound), then From (status callbacks) to find the
// campaign's auth token. Last resort: look up the MessageSid in our DB.
//
// SECURITY: All failure paths return false (reject). Only an explicit
// successful Twilio.validateRequest returns true. In dev environments
// without TWILIO_ENCRYPTION_KEY, webhooks are rejected — configure the
// key or test with Twilio's request validator manually.

export async function validateTwilioWebhookSignature(
  signature: string,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  // Sandbox/dev bypass — Cloudflare proxying breaks Twilio signature validation.
  // Remove this when using a production WABA number with proper signature flow.
  if (process.env.TWILIO_SKIP_SIGNATURE_VALIDATION === "true") return true;

  const encryptionKey = process.env.TWILIO_ENCRYPTION_KEY?.trim() ?? "";
  if (!encryptionKey) return false; // No encryption key → reject webhook

  if (!signature) return false; // No signature header → reject

  // Try To first (inbound: To = Twilio number), then From (status: From = Twilio number)
  const candidates = [params.To, params.From].filter(Boolean);

  let encryptedToken = "";

  for (const candidate of candidates) {
    const res = await pool.query<{ config: Record<string, unknown> }>(
      `SELECT config FROM campaigns
       WHERE config->'twilio'->>'whatsapp_from' = $1
       LIMIT 1`,
      [candidate],
    );
    const row = res.rows[0];
    if (row) {
      encryptedToken = (row.config?.twilio as { auth_token?: string })?.auth_token ?? "";
      if (encryptedToken) break;
    }
  }

  // Last resort: look up the MessageSid in our messages table to find the campaign
  if (!encryptedToken && params.MessageSid) {
    const msgRes = await pool.query<{ campaign_id: string }>(
      `SELECT campaign_id FROM cms_twilio_messages WHERE twilio_sid = $1 LIMIT 1`,
      [params.MessageSid],
    );
    if (msgRes.rows[0]) {
      const campRes = await pool.query<{ config: Record<string, unknown> }>(
        `SELECT config FROM campaigns WHERE id = $1`,
        [msgRes.rows[0].campaign_id],
      );
      if (campRes.rows[0]) {
        encryptedToken = (campRes.rows[0].config?.twilio as { auth_token?: string })?.auth_token ?? "";
      }
    }
  }

  if (!encryptedToken) return false; // No campaign found → reject

  try {
    const authToken = decrypt(encryptedToken);
    return twilio.validateRequest(authToken, signature, url, params);
  } catch {
    return false;
  }
}

// ── Get message history for a contact ───────────────────────────────

export async function getContactMessages(
  contactId: string,
  campaignId: string,
): Promise<TwilioMessage[]> {
  const result = await pool.query<TwilioMessage>(
    `SELECT id, contact_id, campaign_id, direction, body,
            twilio_sid, status, sent_by, created_at
     FROM cms_twilio_messages
     WHERE contact_id = $1 AND campaign_id = $2
     ORDER BY created_at ASC`,
    [contactId, campaignId],
  );
  return result.rows;
}

// ── DB helpers ───────────────────────────────────────────────────────

async function insertMessage(params: {
  contactId: string;
  campaignId: string;
  direction: "outbound" | "inbound";
  body: string;
  twilioSid: string | null;
  status: MessageStatus;
  sentBy: string | null;
}): Promise<TwilioMessage> {
  const { contactId, campaignId, direction, body, twilioSid, status, sentBy } = params;
  const result = await pool.query<TwilioMessage>(
    `INSERT INTO cms_twilio_messages
       (contact_id, campaign_id, direction, body, twilio_sid, status, sent_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, contact_id, campaign_id, direction, body,
               twilio_sid, status, sent_by, created_at`,
    [contactId, campaignId, direction, body, twilioSid, status, sentBy],
  );
  const row = result.rows[0];
  if (!row) throw new Error("insert cms_twilio_messages no devolvió fila");
  return row;
}

// ── Utilities ────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  const stripped = phone.replace(/[^\d+]/g, "");
  if (stripped.startsWith("+")) return stripped;
  if (stripped.length === 9) return `+51${stripped}`;
  if (stripped.length >= 11) return `+${stripped}`;
  return `+51${stripped}`;
}

function mapTwilioStatus(status: string): MessageStatus {
  const map: Record<string, MessageStatus> = {
    queued: "queued",
    sent: "sent",
    delivered: "delivered",
    read: "read",
    failed: "failed",
    undelivered: "undelivered",
    received: "received",
  };
  return map[status.toLowerCase()] ?? "queued";
}

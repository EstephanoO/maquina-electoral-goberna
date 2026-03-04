/**
 * Meta Lead Ads Webhook
 *
 * Receives lead data from Meta (Facebook/Instagram) Lead Ads and creates CMS
 * contacts with contact_source = 'meta'.
 *
 * Setup in Meta for Developers:
 *   1. Go to your App → Webhooks → Add Webhook
 *   2. Callback URL: https://api.goberna.us/api/webhooks/meta/leads
 *   3. Verify Token: value of env var META_WEBHOOK_VERIFY_TOKEN
 *   4. Subscribe to: leadgen
 *
 * Meta webhook flow:
 *   - GET  /api/webhooks/meta/leads  → verification challenge (one-time setup)
 *   - POST /api/webhooks/meta/leads  → lead data delivery
 *
 * To map a Meta Lead Form to a campaign, set campaign_id in the form's
 * "hidden fields" or configure META_LEAD_CAMPAIGN_MAP env var as JSON:
 *   META_LEAD_CAMPAIGN_MAP='{"<form_id>":"<campaign_uuid>","<page_id>":"<campaign_uuid>"}'
 *
 * Security: Meta signs payloads with X-Hub-Signature-256 using the app secret.
 * We verify this before processing.
 */
import type { FastifyPluginAsync } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import type { AppEnv } from "../../config/env";
import { errorPayload } from "../../infra/http";
import { pool } from "../../db";
import { cmsEvents } from "../../infra/cms-events";

// ── Meta payload schemas ─────────────────────────────────────────────

// A single field value in the lead form submission
const metaFieldDataSchema = z.object({
  name: z.string(),
  values: z.array(z.string()),
});

// A single lead entry
const metaLeadgenSchema = z.object({
  id: z.string(),           // Meta lead ID
  form_id: z.string(),      // Lead Ad Form ID
  page_id: z.string(),      // Facebook Page ID
  ad_id: z.string().optional(),
  adgroup_id: z.string().optional(),
  created_time: z.number().optional(),
  field_data: z.array(metaFieldDataSchema).optional().default([]),
});

// The full webhook payload from Meta
const metaWebhookSchema = z.object({
  object: z.literal("page"),
  entry: z.array(
    z.object({
      id: z.string(),
      time: z.number().optional(),
      changes: z.array(
        z.object({
          value: metaLeadgenSchema,
          field: z.literal("leadgen"),
        }),
      ),
    }),
  ),
});

// ── Field name normalization ─────────────────────────────────────────
// Meta uses snake_case field names; we normalize common variations.
const FIELD_MAP: Record<string, string> = {
  full_name: "nombre",
  first_name: "nombre",
  name: "nombre",
  phone_number: "telefono",
  phone: "telefono",
  email: "email",
  city: "zona",
  zip_code: "distrito",
  estado: "zona",
  provincia: "zona",
  distrito: "distrito",
  comments: "comentarios",
  comment: "comentarios",
};

function extractLeadFields(fieldData: Array<{ name: string; values: string[] }>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of fieldData) {
    const key = FIELD_MAP[field.name.toLowerCase()] ?? field.name.toLowerCase();
    const value = field.values[0] ?? "";
    if (value) result[key] = value;
  }
  return result;
}

// ── Signature verification ───────────────────────────────────────────
function verifyMetaSignature(rawBody: Buffer | string, signature: string, appSecret: string): boolean {
  if (!signature.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  try {
    return timingSafeEqual(
      Buffer.from(signature.slice(7), "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

// ── Route builder ────────────────────────────────────────────────────

export function buildMetaRoutes(env: AppEnv): FastifyPluginAsync {
  return async (app) => {
    // ── GET /api/webhooks/meta/leads — verification challenge ──────────
    // Meta calls this once during webhook setup to verify the endpoint.
    app.get("/api/webhooks/meta/leads", async (request, reply) => {
      const query = request.query as Record<string, string>;
      const mode      = query["hub.mode"];
      const token     = query["hub.verify_token"];
      const challenge = query["hub.challenge"];

      const verifyToken = env.metaWebhookVerifyToken;
      if (!verifyToken) {
        app.log.warn("META_WEBHOOK_VERIFY_TOKEN not set — verification will fail");
        return reply.code(403).send({ error: "Verification token not configured" });
      }

      if (mode === "subscribe" && token === verifyToken) {
        app.log.info("Meta webhook verification successful");
        return reply.code(200).send(challenge);
      }

      return reply.code(403).send({ error: "Verification failed" });
    });

    // ── POST /api/webhooks/meta/leads — lead data delivery ─────────────
    // Meta calls this for each new lead captured via Lead Ads.
    // We verify the signature, parse the payload, and upsert CMS contacts.
    app.post("/api/webhooks/meta/leads", async (request, reply) => {
      const requestId = String(request.id);

      // Signature verification
      const appSecret = env.metaAppSecret;
      if (appSecret) {
        const signature = String(request.headers["x-hub-signature-256"] ?? "");
        const rawBody = (request.body as Buffer | string) ?? "";
        if (!verifyMetaSignature(rawBody, signature, appSecret)) {
          app.log.warn({ request_id: requestId }, "Meta webhook signature verification failed");
          return reply.code(401).send(errorPayload(requestId, "INVALID_SIGNATURE", "firma invalida"));
        }
      } else {
        app.log.warn("META_APP_SECRET not set — skipping signature verification (unsafe for production)");
      }

      // Parse campaign map from env
      let campaignMap: Record<string, string> = {};
      const rawMap = env.metaLeadCampaignMap;
      if (rawMap) {
        try { campaignMap = JSON.parse(rawMap); } catch {
          app.log.error("META_LEAD_CAMPAIGN_MAP is not valid JSON");
        }
      }

      // Parse body
      const parsed = metaWebhookSchema.safeParse(request.body);
      if (!parsed.success) {
        // Meta retries on non-2xx; return 200 to ack so Meta doesn't retry junk
        app.log.warn({ issues: parsed.error.issues, request_id: requestId }, "Meta webhook payload unexpected shape");
        return reply.code(200).send({ ok: true, processed: 0 });
      }

      let processed = 0;
      let skipped   = 0;

      for (const entry of parsed.data.entry) {
        for (const change of entry.changes) {
          const lead = change.value;

          // Resolve campaign: form_id takes precedence over page_id
          const campaignId = campaignMap[lead.form_id] ?? campaignMap[lead.page_id] ?? null;
          if (!campaignId) {
            app.log.warn(
              { form_id: lead.form_id, page_id: lead.page_id, request_id: requestId },
              "Meta lead: no campaign mapping found, skipping",
            );
            skipped++;
            continue;
          }

          const fields = extractLeadFields(lead.field_data ?? []);
          const telefono = fields.telefono ? fields.telefono.replace(/[^\d+]/g, "") : null;
          const nombre   = fields.nombre ?? "Contacto Meta";

          // Dedup: skip if phone already exists in this campaign
          if (telefono) {
            const dupeCheck = await pool.query<{ id: string }>(
              `SELECT id FROM form_submissions
               WHERE campaign_id = $1
                 AND data->>'telefono' = $2
                 AND deleted_at IS NULL
               LIMIT 1`,
              [campaignId, telefono.replace(/\D/g, "")],
            );
            if (dupeCheck.rows.length > 0) {
              app.log.info(
                { meta_lead_id: lead.id, campaign_id: campaignId, phone: telefono },
                "Meta lead: duplicate phone, skipping",
              );
              skipped++;
              continue;
            }
          }

          // Build data JSONB — include all fields Meta sent us
          const data: Record<string, string> = { nombre, ...fields };
          if (telefono) data.telefono = telefono.replace(/\D/g, "");
          // Store Meta lead metadata for traceability
          data._meta_lead_id  = lead.id;
          data._meta_form_id  = lead.form_id;
          data._meta_page_id  = lead.page_id;
          if (lead.ad_id)      data._meta_ad_id      = lead.ad_id;
          if (lead.adgroup_id) data._meta_adgroup_id = lead.adgroup_id;

          const clientId = `meta-${lead.id}`;

          try {
            const { rows } = await pool.query<{ id: string; created_at: string }>(
              `INSERT INTO form_submissions
                 (campaign_id, data, client_id, cms_status, contact_source)
               VALUES ($1, $2, $3, 'nuevo', 'meta')
               ON CONFLICT (client_id) DO NOTHING
               RETURNING id, created_at`,
              [campaignId, JSON.stringify(data), clientId],
            );

            if (rows[0]) {
              processed++;
              app.log.info(
                { contact_id: rows[0].id, meta_lead_id: lead.id, campaign_id: campaignId },
                "Meta lead ingested",
              );

              // Broadcast to SSE clients so operators see new leads in real time
              cmsEvents.emitCms("contact.created", {
                campaignId,
                contactId: rows[0].id,
                nombre,
                telefono: data.telefono ?? null,
                contact_source: "meta",
                created_at: rows[0].created_at,
              });
            } else {
              // ON CONFLICT DO NOTHING — already exists
              skipped++;
            }
          } catch (err) {
            app.log.error({ err, meta_lead_id: lead.id, request_id: requestId }, "Meta lead insert failed");
            // Don't increment processed; this lead will not be retried by Meta
            // unless we return non-2xx — but we continue processing the rest of the batch
          }
        }
      }

      app.log.info({ processed, skipped, request_id: requestId }, "Meta webhook batch complete");

      // Always return 200 to ack — Meta stops retrying on 2xx
      return reply.code(200).send({ ok: true, processed, skipped });
    });
  };
}

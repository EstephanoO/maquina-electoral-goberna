import { Router } from "express";
import { sql } from "../sql.js";
import { buildSegmentSQL } from "../services/campaign-segments.js";
import type { AuthedRequest } from "../auth.js";

/**
 * Campaigns: re-engagement masivo. Flow:
 *   1. POST /campaigns         → draft con segment_filter (JSONB)
 *   2. POST /campaigns/preview → cuenta + sample (sin materializar)
 *   3. POST /:id/materialize   → crea rows en campaign_recipients (status=pending)
 *   4. POST /:id/launch        → status=running, scheduled_at=now()
 *   5. GET  /campaigns/queue   → bot pulla pending recipients (throttle + window)
 *   6. POST /recipient/:id/sent|failed → bot reporta resultado
 */
export const campaignsRouter = Router();

// ── Presets ─────────────────────────────────────────────────────────
campaignsRouter.get("/segment-presets", async (_req, res) => {
  const rows = await sql`SELECT id, slug, name, description, filter, icon FROM segment_presets ORDER BY id`;
  res.json({ presets: rows });
});

// ── Preview segment count + sample ──────────────────────────────────
campaignsRouter.post("/campaigns/preview", async (req, res) => {
  const filter = req.body?.filter ?? {};
  const { where, params } = buildSegmentSQL(filter);
  try {
    const countRes = await sql.unsafe(`SELECT count(*)::int AS n FROM leads l WHERE ${where}`, params);
    const sample = await sql.unsafe(
      `SELECT id, name, phone, country, buyer_tier, total_usd_spent, last_course
         FROM leads l
        WHERE ${where}
        ORDER BY total_usd_spent DESC NULLS LAST
        LIMIT 10`,
      params,
    );
    res.json({ total: (countRes as any[])[0]?.n ?? 0, sample });
  } catch (e: any) {
    res.status(400).json({ error: "preview_failed", message: e.message });
  }
});

// ── CRUD ────────────────────────────────────────────────────────────
campaignsRouter.get("/campaigns", async (_req, res) => {
  const rows = await sql`SELECT * FROM v_campaign_progress`;
  res.json({ campaigns: rows });
});

campaignsRouter.get("/campaigns/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const rows = await sql`SELECT * FROM campaigns WHERE id = ${id}`;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

campaignsRouter.post("/campaigns", async (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  if (!b.name) return res.status(400).json({ error: "name_required" });
  const rows = await sql`
    INSERT INTO campaigns (
      name, description, segment_filter,
      template_id, custom_body, custom_image_url, custom_document_url,
      bot_instance_id, throttle_per_min, window_start_hr, window_end_hr,
      created_by
    ) VALUES (
      ${b.name}, ${b.description ?? null}, ${b.segment_filter ?? {}}::jsonb,
      ${b.template_id ?? null}, ${b.custom_body ?? null}, ${b.custom_image_url ?? null}, ${b.custom_document_url ?? null},
      ${b.bot_instance_id ?? null}, ${b.throttle_per_min ?? 10},
      ${b.window_start_hr ?? 9}, ${b.window_end_hr ?? 19},
      ${(req as any).userEmail ?? 'unknown'}
    )
    RETURNING *
  `;
  res.json(rows[0]);
});

campaignsRouter.put("/campaigns/:id", async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const rows = await sql`
    UPDATE campaigns SET
      name = COALESCE(${b.name ?? null}, name),
      description = ${b.description ?? null},
      segment_filter = COALESCE(${b.segment_filter ?? null}::jsonb, segment_filter),
      template_id = ${b.template_id ?? null},
      custom_body = ${b.custom_body ?? null},
      custom_image_url = ${b.custom_image_url ?? null},
      custom_document_url = ${b.custom_document_url ?? null},
      bot_instance_id = ${b.bot_instance_id ?? null},
      throttle_per_min = COALESCE(${b.throttle_per_min ?? null}, throttle_per_min),
      window_start_hr = COALESCE(${b.window_start_hr ?? null}, window_start_hr),
      window_end_hr = COALESCE(${b.window_end_hr ?? null}, window_end_hr),
      scheduled_at = ${b.scheduled_at ?? null},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

// ── Materialize recipients ──────────────────────────────────────────
campaignsRouter.post("/campaigns/:id/materialize", async (req, res) => {
  const id = Number(req.params.id);
  const c = (await sql`SELECT * FROM campaigns WHERE id = ${id}`)[0];
  if (!c) return res.status(404).json({ error: "not_found" });
  const { where, params } = buildSegmentSQL(c.segment_filter || {});

  // Insert recipients dedup'd por lead_id (UNIQUE constraint)
  const queryStr = `
    INSERT INTO campaign_recipients (campaign_id, lead_id)
    SELECT $${params.length + 1}, l.id FROM leads l WHERE ${where}
    ON CONFLICT (campaign_id, lead_id) DO NOTHING
  `;
  await sql.unsafe(queryStr, [...params, id]);

  const counts = await sql`
    SELECT count(*)::int AS total FROM campaign_recipients WHERE campaign_id = ${id}
  `;
  await sql`UPDATE campaigns SET total_recipients = ${counts[0].total}, updated_at = now() WHERE id = ${id}`;

  res.json({ ok: true, total_recipients: counts[0].total });
});

// ── Launch / Pause / Cancel ─────────────────────────────────────────
campaignsRouter.post("/campaigns/:id/launch", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await sql`
    UPDATE campaigns SET
      status = 'running',
      started_at = COALESCE(started_at, now()),
      scheduled_at = COALESCE(scheduled_at, now()),
      updated_at = now()
    WHERE id = ${id} AND status IN ('draft','scheduled','paused')
    RETURNING *
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found_or_invalid_state" });
  res.json(rows[0]);
});

campaignsRouter.post("/campaigns/:id/pause", async (req, res) => {
  const id = Number(req.params.id);
  await sql`UPDATE campaigns SET status = 'paused', updated_at = now() WHERE id = ${id} AND status = 'running'`;
  res.json({ ok: true });
});

campaignsRouter.post("/campaigns/:id/cancel", async (req, res) => {
  const id = Number(req.params.id);
  await sql`UPDATE campaigns SET status = 'cancelled', completed_at = now(), updated_at = now() WHERE id = ${id}`;
  res.json({ ok: true });
});

// ── Bot pulls next batch (called every minute) ──────────────────────
campaignsRouter.get("/campaigns/queue", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const now = new Date();
  const hr = now.getUTCHours() - 5;  // Lima UTC-5
  const hour = (hr + 24) % 24;
  const rows = await sql`
    SELECT
      r.id AS recipient_id, r.campaign_id, r.lead_id,
      l.phone, l.name, l.country,
      c.template_id, c.custom_body, c.custom_image_url, c.custom_document_url,
      c.window_start_hr, c.window_end_hr, c.bot_instance_id,
      t.body AS template_body, t.image_url AS template_image_url,
      t.document_url AS template_document_url,
      t.document_filename, t.document_mime, t.video_url AS template_video_url,
      t.media_kind
    FROM campaign_recipients r
    JOIN campaigns c ON c.id = r.campaign_id
    JOIN leads l ON l.id = r.lead_id
    LEFT JOIN templates t ON t.id = c.template_id
    WHERE r.status = 'pending'
      AND c.status = 'running'
      AND ${hour} BETWEEN c.window_start_hr AND c.window_end_hr - 1
    ORDER BY r.id ASC
    LIMIT ${limit}
  `;
  res.json({ items: rows });
});

// ── Bot reports send result ─────────────────────────────────────────
campaignsRouter.post("/campaigns/recipient/:id/sent", async (req, res) => {
  const id = Number(req.params.id);
  const { message_id } = req.body ?? {};
  await sql`
    UPDATE campaign_recipients SET status = 'sent', message_id = ${message_id ?? null}, sent_at = now(), updated_at = now()
    WHERE id = ${id}
  `;
  await sql`
    UPDATE campaigns SET sent_count = sent_count + 1, updated_at = now()
    WHERE id = (SELECT campaign_id FROM campaign_recipients WHERE id = ${id})
  `;
  // Auto-complete cuando no quedan pending
  await sql`
    UPDATE campaigns c SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE c.id = (SELECT campaign_id FROM campaign_recipients WHERE id = ${id})
      AND c.status = 'running'
      AND NOT EXISTS (SELECT 1 FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'pending')
  `;
  res.json({ ok: true });
});

campaignsRouter.post("/campaigns/recipient/:id/failed", async (req, res) => {
  const id = Number(req.params.id);
  const { error_msg } = req.body ?? {};
  await sql`
    UPDATE campaign_recipients SET status = 'failed', error_msg = ${error_msg ?? null}, updated_at = now()
    WHERE id = ${id}
  `;
  await sql`
    UPDATE campaigns SET failed_count = failed_count + 1, updated_at = now()
    WHERE id = (SELECT campaign_id FROM campaign_recipients WHERE id = ${id})
  `;
  res.json({ ok: true });
});

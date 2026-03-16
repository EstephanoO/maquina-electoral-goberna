import { pool } from "../../db";

// ── Ensure table ──────────────────────────────────────────────────────
export async function ensureQrLeadsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS qr_leads (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id   uuid        NOT NULL REFERENCES campaigns(id),
      brigadista_id uuid        NOT NULL REFERENCES users(id),
      -- Phone number of the person who scanned (if they sent WA message and we captured it)
      -- For now NULL — brigadista fills it manually or via CMS webhook later
      phone         text,
      -- The text the voter sent (captured via WA webhook if integrated)
      message_text  text,
      -- Source metadata
      scan_source   text        NOT NULL DEFAULT 'qr',   -- 'qr' | 'link' | 'manual'
      user_agent    text,
      scanned_at    timestamptz NOT NULL DEFAULT now(),
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_qr_leads_campaign
    ON qr_leads(campaign_id, brigadista_id, scanned_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_qr_leads_brigadista
    ON qr_leads(brigadista_id, scanned_at DESC)
  `);
}

// ── Record a QR scan ──────────────────────────────────────────────────
export async function recordScan(params: {
  campaign_id: string;
  brigadista_id: string;
  phone?: string | null;
  message_text?: string | null;
  scan_source?: string;
  user_agent?: string | null;
}): Promise<{ id: string; scanned_at: string }> {
  const result = await pool.query<{ id: string; scanned_at: string }>(
    `INSERT INTO qr_leads (campaign_id, brigadista_id, phone, message_text, scan_source, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, scanned_at`,
    [
      params.campaign_id,
      params.brigadista_id,
      params.phone ?? null,
      params.message_text ?? null,
      params.scan_source ?? "qr",
      params.user_agent ?? null,
    ]
  );
  return result.rows[0]!;
}

// ── Stats for a brigadista ────────────────────────────────────────────
export async function getMyStats(
  brigadista_id: string,
  campaign_id: string
): Promise<{
  total: number;
  today: number;
  this_week: number;
}> {
  const result = await pool.query<{
    total: string;
    today: string;
    this_week: string;
  }>(
    `SELECT
       COUNT(*)                                                          AS total,
       COUNT(*) FILTER (WHERE scanned_at >= CURRENT_DATE)               AS today,
       COUNT(*) FILTER (WHERE scanned_at >= date_trunc('week', now()))   AS this_week
     FROM qr_leads
     WHERE brigadista_id = $1 AND campaign_id = $2`,
    [brigadista_id, campaign_id]
  );
  const row = result.rows[0];
  return {
    total:     parseInt(row?.total     ?? "0", 10),
    today:     parseInt(row?.today     ?? "0", 10),
    this_week: parseInt(row?.this_week ?? "0", 10),
  };
}

// ── Leaderboard for campaign ──────────────────────────────────────────
export async function getCampaignLeaderboard(
  campaign_id: string,
  limit = 20
): Promise<Array<{
  brigadista_id: string;
  full_name: string;
  total: number;
  today: number;
}>> {
  const result = await pool.query<{
    brigadista_id: string;
    full_name: string;
    total: string;
    today: string;
  }>(
    `SELECT
       q.brigadista_id,
       u.full_name,
       COUNT(*)                                                          AS total,
       COUNT(*) FILTER (WHERE q.scanned_at >= CURRENT_DATE)             AS today
     FROM qr_leads q
     JOIN users u ON u.id = q.brigadista_id
     WHERE q.campaign_id = $1
     GROUP BY q.brigadista_id, u.full_name
     ORDER BY total DESC
     LIMIT $2`,
    [campaign_id, limit]
  );

  return result.rows.map((row) => ({
    brigadista_id: row.brigadista_id,
    full_name:     row.full_name,
    total:         parseInt(row.total, 10),
    today:         parseInt(row.today, 10),
  }));
}

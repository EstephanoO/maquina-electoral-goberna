import { pool } from "../../db";

// ── Ensure tables ────────────────────────────────────────────────────
export async function ensureQrTrackerTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS qr_trackers (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      slug        text        NOT NULL UNIQUE,
      label       text,
      target_url  text        NOT NULL,
      scan_count  bigint      NOT NULL DEFAULT 0,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS qr_scans (
      id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      tracker_id  uuid        NOT NULL REFERENCES qr_trackers(id),
      ip          text,
      user_agent  text,
      referer     text,
      scanned_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_qr_scans_tracker
    ON qr_scans(tracker_id, scanned_at DESC)
  `);
}

// ── Create a tracker ─────────────────────────────────────────────────
export async function createTracker(params: {
  slug: string;
  target_url: string;
  label?: string;
}): Promise<{ id: string; slug: string; target_url: string; created_at: string }> {
  const result = await pool.query<{ id: string; slug: string; target_url: string; created_at: string }>(
    `INSERT INTO qr_trackers (slug, target_url, label)
     VALUES ($1, $2, $3)
     RETURNING id, slug, target_url, created_at`,
    [params.slug, params.target_url, params.label ?? null],
  );
  return result.rows[0]!;
}

// ── Record a scan (atomic increment + detail row) ────────────────────
export async function recordScan(params: {
  tracker_id: string;
  ip?: string | null;
  user_agent?: string | null;
  referer?: string | null;
}): Promise<{ scan_count: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const upd = await client.query<{ scan_count: string }>(
      `UPDATE qr_trackers SET scan_count = scan_count + 1
       WHERE id = $1
       RETURNING scan_count`,
      [params.tracker_id],
    );

    await client.query(
      `INSERT INTO qr_scans (tracker_id, ip, user_agent, referer)
       VALUES ($1, $2, $3, $4)`,
      [params.tracker_id, params.ip ?? null, params.user_agent ?? null, params.referer ?? null],
    );

    await client.query("COMMIT");
    return { scan_count: parseInt(upd.rows[0]!.scan_count, 10) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Get tracker by slug ──────────────────────────────────────────────
export async function getBySlug(slug: string): Promise<{
  id: string;
  slug: string;
  label: string | null;
  target_url: string;
  scan_count: number;
  created_at: string;
} | null> {
  const result = await pool.query<{
    id: string;
    slug: string;
    label: string | null;
    target_url: string;
    scan_count: string;
    created_at: string;
  }>(
    `SELECT id, slug, label, target_url, scan_count, created_at
     FROM qr_trackers WHERE slug = $1`,
    [slug],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...row, scan_count: parseInt(row.scan_count, 10) };
}

// ── Get recent scans for a tracker ───────────────────────────────────
export async function getRecentScans(
  tracker_id: string,
  limit = 50,
): Promise<Array<{ id: string; ip: string | null; user_agent: string | null; scanned_at: string }>> {
  const result = await pool.query<{
    id: string;
    ip: string | null;
    user_agent: string | null;
    scanned_at: string;
  }>(
    `SELECT id, ip, user_agent, scanned_at
     FROM qr_scans
     WHERE tracker_id = $1
     ORDER BY scanned_at DESC
     LIMIT $2`,
    [tracker_id, limit],
  );
  return result.rows;
}

// ── List all trackers ────────────────────────────────────────────────
export async function listAll(): Promise<Array<{
  id: string;
  slug: string;
  label: string | null;
  target_url: string;
  scan_count: number;
  created_at: string;
}>> {
  const result = await pool.query<{
    id: string;
    slug: string;
    label: string | null;
    target_url: string;
    scan_count: string;
    created_at: string;
  }>(
    `SELECT id, slug, label, target_url, scan_count, created_at
     FROM qr_trackers ORDER BY created_at DESC`,
  );
  return result.rows.map((r) => ({ ...r, scan_count: parseInt(r.scan_count, 10) }));
}

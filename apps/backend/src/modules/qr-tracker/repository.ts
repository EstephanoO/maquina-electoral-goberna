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

  // Geo columns (added after initial release)
  await pool.query(`ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS country text`);
  await pool.query(`ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS region text`);
  await pool.query(`ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS city text`);
  await pool.query(`ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS lat double precision`);
  await pool.query(`ALTER TABLE qr_scans ADD COLUMN IF NOT EXISTS lon double precision`);
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
}): Promise<{ scan_count: number; scan_id: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const upd = await client.query<{ scan_count: string }>(
      `UPDATE qr_trackers SET scan_count = scan_count + 1
       WHERE id = $1
       RETURNING scan_count`,
      [params.tracker_id],
    );

    const ins = await client.query<{ id: string }>(
      `INSERT INTO qr_scans (tracker_id, ip, user_agent, referer)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [params.tracker_id, params.ip ?? null, params.user_agent ?? null, params.referer ?? null],
    );

    await client.query("COMMIT");
    return { scan_count: parseInt(upd.rows[0]!.scan_count, 10), scan_id: ins.rows[0]!.id };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Update scan with geo data ────────────────────────────────────────
export async function updateScanGeo(scanId: string, geo: {
  country: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
}): Promise<void> {
  await pool.query(
    `UPDATE qr_scans SET country=$1, region=$2, city=$3, lat=$4, lon=$5 WHERE id=$6`,
    [geo.country, geo.region, geo.city, geo.lat, geo.lon, scanId],
  );
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
): Promise<Array<{ id: string; ip: string | null; user_agent: string | null; scanned_at: string; country: string | null; region: string | null; city: string | null; lat: number | null; lon: number | null }>> {
  const result = await pool.query<{
    id: string;
    ip: string | null;
    user_agent: string | null;
    scanned_at: string;
    country: string | null;
    region: string | null;
    city: string | null;
    lat: string | null;
    lon: string | null;
  }>(
    `SELECT id, ip, user_agent, scanned_at, country, region, city, lat, lon
     FROM qr_scans
     WHERE tracker_id = $1
     ORDER BY scanned_at DESC
     LIMIT $2`,
    [tracker_id, limit],
  );
  return result.rows.map((r) => ({
    ...r,
    lat: r.lat != null ? parseFloat(r.lat) : null,
    lon: r.lon != null ? parseFloat(r.lon) : null,
  }));
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

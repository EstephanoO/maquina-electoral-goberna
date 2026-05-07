import { pool } from "../../db";

export type AudioCatalogItem = {
  id: string;
  campaign_id: string;
  category: string;
  label: string;
  description: string;
  script_text: string;
  audio_base64: string | null;
  mime_type: string;
  audio_size: number;
  duration_ms: number;
  voice_id: string;
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Lightweight version without audio_base64 (for listing) */
export type AudioCatalogMeta = Omit<AudioCatalogItem, "audio_base64"> & {
  has_audio: boolean;
};

export type AudioCatalogCategoryRow = {
  id: string;
  campaign_id: string;
  key: string;
  label: string;
  icon: string;
  color: string;
  sort_order: number;
  created_at: string;
};

// ══════════════════════════════════════════════════════════════════════
// CATALOG ITEMS
// ══════════════════════════════════════════════════════════════════════

// ── List catalog items (metadata only — no audio blob) ───────────────
export async function list(
  campaignId: string,
  activeOnly: boolean = true,
): Promise<AudioCatalogMeta[]> {
  const conditions = ["campaign_id = $1"];
  const params: unknown[] = [campaignId];

  if (activeOnly) {
    conditions.push("is_active = true");
  }

  const { rows } = await pool.query<AudioCatalogMeta>(`
    SELECT
      id::text, campaign_id::text, category, label, description,
      script_text, mime_type, audio_size, duration_ms, voice_id,
      sort_order, is_active, created_by::text,
      created_at::text, updated_at::text,
      (audio_base64 IS NOT NULL AND audio_base64 != '') as has_audio
    FROM audio_catalog
    WHERE ${conditions.join(" AND ")}
    ORDER BY sort_order, created_at
  `, params);

  return rows;
}

// ── Get single item with audio ───────────────────────────────────────
export async function getWithAudio(id: string): Promise<AudioCatalogItem | null> {
  const { rows } = await pool.query<AudioCatalogItem>(
    `SELECT
      id::text, campaign_id::text, category, label, description,
      script_text, audio_base64, mime_type, audio_size, duration_ms,
      voice_id, sort_order, is_active, created_by::text,
      created_at::text, updated_at::text
    FROM audio_catalog WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// ── Save generated audio to an existing item ─────────────────────────
export async function saveAudio(
  id: string,
  audioBase64: string,
  audioSize: number,
  durationMs: number,
  scriptOverride?: string,
): Promise<void> {
  if (scriptOverride) {
    await pool.query(`
      UPDATE audio_catalog SET
        audio_base64 = $2,
        audio_size = $3,
        duration_ms = $4,
        script_text = $5,
        updated_at = now()
      WHERE id = $1
    `, [id, audioBase64, audioSize, durationMs, scriptOverride]);
  } else {
    await pool.query(`
      UPDATE audio_catalog SET
        audio_base64 = $2,
        audio_size = $3,
        duration_ms = $4,
        updated_at = now()
      WHERE id = $1
    `, [id, audioBase64, audioSize, durationMs]);
  }
}

// ── Create a new catalog item ────────────────────────────────────────
export async function create(data: {
  campaign_id: string;
  category: string;
  label: string;
  description: string;
  script_text: string;
  sort_order: number;
  voice_id?: string;
  created_by?: string;
}): Promise<AudioCatalogMeta> {
  const { rows } = await pool.query<AudioCatalogMeta>(`
    INSERT INTO audio_catalog (
      campaign_id, category, label, description, script_text,
      sort_order, voice_id, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'ioPHn4YlxFFAweLTLkxV'), $8)
    RETURNING
      id::text, campaign_id::text, category, label, description,
      script_text, mime_type, audio_size, duration_ms, voice_id,
      sort_order, is_active, created_by::text,
      created_at::text, updated_at::text,
      false as has_audio
  `, [
    data.campaign_id,
    data.category,
    data.label,
    data.description,
    data.script_text,
    data.sort_order,
    data.voice_id ?? null,
    data.created_by ?? null,
  ]);

  return rows[0]!;
}

// ── Update catalog item metadata ─────────────────────────────────────
export async function update(
  id: string,
  data: Partial<{
    label: string;
    description: string;
    script_text: string;
    sort_order: number;
    is_active: boolean;
  }>,
): Promise<AudioCatalogMeta | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      sets.push(`${key} = $${idx}`);
      params.push(value);
      idx++;
    }
  }

  if (sets.length === 0) return null;
  sets.push("updated_at = now()");

  // If script_text changed, clear the audio (needs re-generation)
  if (data.script_text !== undefined) {
    sets.push("audio_base64 = NULL");
    sets.push("audio_size = 0");
    sets.push("duration_ms = 0");
  }

  params.push(id);

  const { rows } = await pool.query<AudioCatalogMeta>(`
    UPDATE audio_catalog SET ${sets.join(", ")}
    WHERE id = $${idx}
    RETURNING
      id::text, campaign_id::text, category, label, description,
      script_text, mime_type, audio_size, duration_ms, voice_id,
      sort_order, is_active, created_by::text,
      created_at::text, updated_at::text,
      (audio_base64 IS NOT NULL AND audio_base64 != '') as has_audio
  `, params);

  return rows[0] ?? null;
}

// ── Delete a catalog item ────────────────────────────────────────────
export async function remove(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    "DELETE FROM audio_catalog WHERE id = $1",
    [id],
  );
  return (rowCount ?? 0) > 0;
}

// ══════════════════════════════════════════════════════════════════════
// CATEGORIES
// ══════════════════════════════════════════════════════════════════════

export async function listCategories(campaignId: string): Promise<AudioCatalogCategoryRow[]> {
  const { rows } = await pool.query<AudioCatalogCategoryRow>(`
    SELECT id::text, campaign_id::text, key, label, icon, color, sort_order, created_at::text
    FROM audio_catalog_categories
    WHERE campaign_id = $1
    ORDER BY sort_order, created_at
  `, [campaignId]);
  return rows;
}

export async function createCategory(data: {
  campaign_id: string;
  key: string;
  label: string;
  icon: string;
  color: string;
  sort_order: number;
}): Promise<AudioCatalogCategoryRow> {
  const { rows } = await pool.query<AudioCatalogCategoryRow>(`
    INSERT INTO audio_catalog_categories (campaign_id, key, label, icon, color, sort_order)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id::text, campaign_id::text, key, label, icon, color, sort_order, created_at::text
  `, [data.campaign_id, data.key, data.label, data.icon, data.color, data.sort_order]);
  return rows[0]!;
}

export async function updateCategory(
  id: string,
  data: Partial<{ label: string; icon: string; color: string; sort_order: number }>,
): Promise<AudioCatalogCategoryRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      sets.push(`${key} = $${idx}`);
      params.push(value);
      idx++;
    }
  }

  if (sets.length === 0) return null;
  params.push(id);

  const { rows } = await pool.query<AudioCatalogCategoryRow>(`
    UPDATE audio_catalog_categories SET ${sets.join(", ")}
    WHERE id = $${idx}
    RETURNING id::text, campaign_id::text, key, label, icon, color, sort_order, created_at::text
  `, params);

  return rows[0] ?? null;
}

export async function removeCategory(id: string): Promise<boolean> {
  // Also delete all catalog items in this category
  const cat = await pool.query<{ campaign_id: string; key: string }>(
    "SELECT campaign_id::text, key FROM audio_catalog_categories WHERE id = $1",
    [id],
  );
  if (!cat.rows[0]) return false;

  await pool.query(
    "DELETE FROM audio_catalog WHERE campaign_id = $1 AND category = $2",
    [cat.rows[0].campaign_id, cat.rows[0].key],
  );

  const { rowCount } = await pool.query(
    "DELETE FROM audio_catalog_categories WHERE id = $1",
    [id],
  );
  return (rowCount ?? 0) > 0;
}

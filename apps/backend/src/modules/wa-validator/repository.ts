import { pool } from "../../db";
import type {
  WaValidatorContactRow,
  WaValidatorResult,
  WaValidatorBrigadistaStats,
  WaValidatorSummary,
} from "./schemas";

// ── Ensure columns exist ───────────────────────────────────────────────
// form_validations is the source table (owned by validacion module).
// We add two columns to support wa-validator without creating a new table.
export async function ensureWaValidatorColumns(): Promise<void> {
  await pool.query(`
    ALTER TABLE form_validations
      ADD COLUMN IF NOT EXISTS wa_valid boolean,
      ADD COLUMN IF NOT EXISTS wa_validated_at timestamptz,
      ADD COLUMN IF NOT EXISTS wa_validated_by uuid REFERENCES users(id)
  `);

  // Index for fast "pending validation" queries
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_form_validations_wa_valid
    ON form_validations(campaign_id, wa_valid)
    WHERE wa_valid IS NULL
  `);
}

// ── GET: contacts pending WA validation ───────────────────────────────
// Returns only contacts that haven't been validated yet (wa_valid IS NULL).
export async function getPendingContacts(
  campaignId: string,
  limit = 500,
  offset = 0
): Promise<{ contacts: WaValidatorContactRow[]; total: number }> {
  const [rows, countRow] = await Promise.all([
    pool.query<WaValidatorContactRow>(
      `SELECT id, nombre, telefono, encuestador, zona, wa_valid, wa_validated_at
       FROM form_validations
       WHERE campaign_id = $1
         AND telefono IS NOT NULL AND telefono != ''
       ORDER BY
         wa_valid IS NULL DESC,  -- pending first
         created_at ASC
       LIMIT $2 OFFSET $3`,
      [campaignId, limit, offset]
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM form_validations
       WHERE campaign_id = $1
         AND telefono IS NOT NULL AND telefono != ''
         AND wa_valid IS NULL`,
      [campaignId]
    ),
  ]);

  return {
    contacts: rows.rows,
    total: parseInt(countRow.rows[0]?.count ?? "0", 10),
  };
}

// ── POST: save batch of results ────────────────────────────────────────
export async function saveResults(
  campaignId: string,
  results: WaValidatorResult[],
  validatedByUserId: string | null
): Promise<number> {
  if (!results.length) return 0;

  let updated = 0;
  // Upsert each result — use UPDATE to avoid touching other fields
  for (const r of results) {
    const res = await pool.query(
      `UPDATE form_validations
       SET wa_valid = $1,
           wa_validated_at = now(),
           wa_validated_by = $2,
           updated_at = now()
       WHERE id = $3
         AND campaign_id = $4
         AND (wa_valid IS NULL OR wa_valid != $1)`,
      [r.wa_valid, validatedByUserId, r.id, campaignId]
    );
    updated += res.rowCount ?? 0;
  }

  return updated;
}

// ── GET: global summary ────────────────────────────────────────────────
export async function getSummary(campaignId: string): Promise<WaValidatorSummary> {
  const res = await pool.query<{
    total: string;
    valid: string;
    invalid: string;
    pending: string;
  }>(
    `SELECT
       COUNT(*)                                                   AS total,
       COUNT(*) FILTER (WHERE wa_valid = true)                    AS valid,
       COUNT(*) FILTER (WHERE wa_valid = false)                   AS invalid,
       COUNT(*) FILTER (WHERE wa_valid IS NULL)                   AS pending
     FROM form_validations
     WHERE campaign_id = $1
       AND telefono IS NOT NULL AND telefono != ''`,
    [campaignId]
  );

  const row = res.rows[0];
  return {
    total:   parseInt(row?.total   ?? "0", 10),
    valid:   parseInt(row?.valid   ?? "0", 10),
    invalid: parseInt(row?.invalid ?? "0", 10),
    pending: parseInt(row?.pending ?? "0", 10),
  };
}

// ── GET: stats by brigadista ───────────────────────────────────────────
// Shows which brigadistas uploaded the most invalid numbers.
// This is the accountability metric for campo quality.
export async function getStatsByBrigadista(
  campaignId: string
): Promise<WaValidatorBrigadistaStats[]> {
  const res = await pool.query<{
    encuestador: string;
    total: string;
    valid: string;
    invalid: string;
    pending: string;
  }>(
    `SELECT
       encuestador,
       COUNT(*)                                                    AS total,
       COUNT(*) FILTER (WHERE wa_valid = true)                     AS valid,
       COUNT(*) FILTER (WHERE wa_valid = false)                    AS invalid,
       COUNT(*) FILTER (WHERE wa_valid IS NULL)                    AS pending
     FROM form_validations
     WHERE campaign_id = $1
       AND telefono IS NOT NULL AND telefono != ''
       AND encuestador IS NOT NULL AND encuestador != ''
     GROUP BY encuestador
     ORDER BY invalid DESC, total DESC`,
    [campaignId]
  );

  return res.rows.map((row) => {
    const total   = parseInt(row.total,   10);
    const invalid = parseInt(row.invalid, 10);
    return {
      encuestador:      row.encuestador,
      total,
      valid:            parseInt(row.valid,   10),
      invalid,
      pending:          parseInt(row.pending, 10),
      invalid_rate_pct: total > 0 ? Math.round((invalid / total) * 100) : 0,
    };
  });
}

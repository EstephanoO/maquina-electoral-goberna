import { sql } from "../sql.js";
import type { Interaction, InteractionKind } from "./types.js";
import { mapInteraction } from "./shared.js";

/**
 * Repository de interactions: timeline del lead. Cada inbound/outbound,
 * stage_change, note, etc. queda persistido. addInteraction verifica que el
 * lead exista (lookup mínimo, no levanta el row completo) antes de insertar.
 */

export async function listInteractions(leadId: number): Promise<Interaction[]> {
  const rows = await sql`
    SELECT * FROM interactions
    WHERE lead_id = ${leadId}
    ORDER BY created_at DESC
    LIMIT 200
  `;
  return rows.map(mapInteraction);
}

export async function addInteraction(
  leadId: number,
  input: { kind?: InteractionKind; body?: string | null; meta?: any; by?: string | null } | any,
): Promise<Interaction | null> {
  // Verifica que el lead exista. SELECT id es barato — no necesitamos el row
  // completo y evitamos un import circular con leads.ts.
  const exists = await sql`SELECT id FROM leads WHERE id = ${leadId} LIMIT 1`;
  if (exists.length === 0) return null;

  const kind = input.kind ?? "note";
  const body = input.body ?? null;
  const meta = input.meta ?? null;
  const by = input.by ?? input.by_user ?? null;
  const rows = await sql`
    INSERT INTO interactions (lead_id, kind, body, meta, by_user)
    VALUES (${leadId}, ${kind}, ${body}, ${sql.json(meta)}, ${by})
    RETURNING *
  `;
  await sql`UPDATE leads SET updated_at = now() WHERE id = ${leadId}`;
  return mapInteraction(rows[0]);
}

export async function addInteractionsBulk(
  leadId: number,
  items: Array<{ kind: string; body?: string; meta?: any; by?: string; created_at?: string }>,
): Promise<{ inserted: number }> {
  let inserted = 0;
  for (const item of items) {
    const ts = item.created_at ? new Date(item.created_at) : new Date();
    await sql`
      INSERT INTO interactions (lead_id, kind, body, meta, by_user, created_at)
      VALUES (${leadId}, ${item.kind}, ${item.body ?? null}, ${sql.json(item.meta ?? null)}, ${item.by ?? null}, ${ts.toISOString()})
    `;
    inserted++;
  }
  await sql`UPDATE leads SET updated_at = now() WHERE id = ${leadId}`;
  return { inserted };
}

/** Backfill de actividad histórica: registra un message_out con timestamp dado.
 *  Usado por el lead-importer cuando trae last_activity_at del CSV externo. */
export async function backfillActivity(
  leadId: number,
  isoTs: string,
  byUser: string | null,
): Promise<void> {
  const t = new Date(isoTs);
  if (isNaN(t.getTime())) return;
  await sql`
    INSERT INTO interactions (lead_id, kind, meta, by_user, created_at)
    VALUES (${leadId}, 'message_out', ${sql.json({ source: "import", backfilled: true })}, ${byUser}, ${t.toISOString()})
  `;
}

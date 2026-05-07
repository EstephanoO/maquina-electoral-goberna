import { sql } from "../sql.js";
import type { Send, SendStatus } from "./types.js";
import { mapSend } from "./shared.js";

/**
 * Repository de sends — outbound queue programable. Cuando un send pasa a
 * status='sent', además inserta una interaction message_out (audit trail
 * en la timeline del lead).
 *
 * pendingSends() es lo que pulla el bot worker cada minuto: pending +
 * scheduled_at <= now() (o sin scheduled_at).
 */

export async function listSends(filters: any = {}): Promise<Send[]> {
  const leadId = typeof filters === "number" ? filters : null;
  const status = typeof filters === "object" ? filters.status ?? null : null;
  const assignedTo = typeof filters === "object" ? filters.assigned_to ?? null : null;
  const availableNow = typeof filters === "object" && filters.availableNow;
  const rows = await sql`
    SELECT s.*, l.name as lead_name, l.phone as lead_phone
    FROM sends s
    JOIN leads l ON l.id = s.lead_id
    WHERE (${leadId}::int IS NULL OR s.lead_id = ${leadId})
      AND (${status}::text IS NULL OR s.status = ${status})
      AND (${assignedTo}::text IS NULL OR s.assigned_to = ${assignedTo})
      AND (${availableNow ? true : null}::bool IS NULL OR (s.scheduled_at IS NULL OR s.scheduled_at <= now()))
    ORDER BY s.created_at DESC LIMIT 200
  `;
  return rows.map(mapSend);
}

export async function createSend(input: {
  lead_id: number;
  body: string;
  body_parts?: string[];
  image_url?: string | null;
  scheduled_at?: string | null;
  assigned_to?: string | null;
}): Promise<Send> {
  const rows = await sql`
    INSERT INTO sends (lead_id, body, body_parts, image_url, status, scheduled_at, assigned_to)
    VALUES (${input.lead_id}, ${input.body}, ${input.body_parts ?? null}, ${input.image_url ?? null},
            'pending', ${input.scheduled_at ?? null}, ${input.assigned_to ?? null})
    RETURNING *
  `;
  return mapSend(rows[0]);
}

export async function createSendsMulti(input: {
  rows: Array<{ lead_id: number; body: string; body_parts: string[]; image_url?: string | null }>;
  assigned_to?: string;
  scheduled_at?: string | null;
}): Promise<Send[]> {
  const results: Send[] = [];
  for (const row of input.rows) {
    const s = await createSend({
      lead_id: row.lead_id,
      body: row.body,
      body_parts: row.body_parts,
      image_url: row.image_url,
      scheduled_at: input.scheduled_at,
      assigned_to: input.assigned_to,
    });
    results.push(s);
  }
  return results;
}

export async function updateSend(
  id: number,
  input: { status?: SendStatus; error?: string | null; sent_at?: string | null },
): Promise<Send | undefined> {
  const cur = await sql`SELECT * FROM sends WHERE id = ${id} LIMIT 1`;
  if (cur.length === 0) return undefined;
  const current = cur[0];
  const sentAt = input.status === "sent"
    ? sql`COALESCE(${input.sent_at ?? null}, now())`
    : sql`sent_at`;
  const rows = await sql`
    UPDATE sends SET
      status   = COALESCE(${input.status ?? null}, status),
      error    = ${input.error !== undefined ? input.error : sql`error`},
      sent_at  = ${sentAt}
    WHERE id = ${id}
    RETURNING *
  `;
  const updated = mapSend(rows[0]);

  // Cuando un send se confirma como sent, insertamos message_out + bumpeamos
  // el updated_at del lead para que aparezca arriba en la lista de chats.
  if (input.status === "sent") {
    await sql`
      INSERT INTO interactions (lead_id, kind, body, meta, by_user)
      VALUES (${current.lead_id}, 'message_out', ${current.body},
              ${sql.json({ via: "queue", send_id: current.id })}, ${current.assigned_to})
    `;
    await sql`UPDATE leads SET updated_at = now() WHERE id = ${current.lead_id}`;
  }
  return updated;
}

export async function cancelSend(id: number): Promise<boolean> {
  return !!(await updateSend(id, { status: "cancelled" }));
}

export async function pendingSends(): Promise<Send[]> {
  const rows = await sql`
    SELECT s.*, l.name as lead_name, l.phone as lead_phone
    FROM sends s
    JOIN leads l ON l.id = s.lead_id
    WHERE s.status = 'pending'
      AND (s.scheduled_at IS NULL OR s.scheduled_at <= now())
    ORDER BY s.scheduled_at ASC LIMIT 100
  `;
  return rows.map(mapSend);
}

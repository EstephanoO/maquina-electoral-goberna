import { sql } from "../sql.js";

/**
 * Repository de picker_feedback — feedback humano sobre las respuestas auto
 * del bot. Sirve para tunear thresholds del cascade después de N votos.
 *
 * Ver migration 014 para schema. La query principal es upsert (INSERT ON
 * CONFLICT) — el operador puede cambiar su voto.
 */

export interface PickerFeedbackInput {
  interaction_id: number;
  lead_id: number;
  picker_method: string | null;
  picker_score: number | null;
  template_id: number | null;
  learned_reply_id: number | null;
  ai_model: string | null;
  was_helpful: boolean;
  notes: string | null;
  created_by: string | null;
}

export async function upsertFeedback(input: PickerFeedbackInput): Promise<{ id: number; updated: boolean }> {
  const rows = await sql<Array<{ id: number; created_at: string }>>`
    INSERT INTO picker_feedback (
      interaction_id, lead_id, picker_method, picker_score, template_id,
      learned_reply_id, ai_model, was_helpful, notes, created_by
    ) VALUES (
      ${input.interaction_id}, ${input.lead_id}, ${input.picker_method},
      ${input.picker_score}, ${input.template_id}, ${input.learned_reply_id},
      ${input.ai_model}, ${input.was_helpful}, ${input.notes}, ${input.created_by}
    )
    ON CONFLICT (interaction_id, created_by) DO UPDATE SET
      was_helpful = EXCLUDED.was_helpful,
      notes       = EXCLUDED.notes,
      created_at  = now()
    RETURNING id, created_at
  `;
  return { id: rows[0].id, updated: false };
}

export interface PickerSummaryRow {
  picker_method: string | null;
  total_votes: number;
  helpful: number;
  unhelpful: number;
  helpful_pct: number;
  avg_score: number | null;
}

export async function getPickerSummary(): Promise<PickerSummaryRow[]> {
  const rows = await sql<PickerSummaryRow[]>`SELECT * FROM picker_feedback_summary`;
  return rows;
}

export async function getFeedbackForInteraction(
  interactionId: number,
): Promise<Array<{ id: number; was_helpful: boolean; notes: string | null; created_by: string | null; created_at: string }>> {
  const rows = await sql`
    SELECT id, was_helpful, notes, created_by, created_at
    FROM picker_feedback
    WHERE interaction_id = ${interactionId}
    ORDER BY created_at DESC
  `;
  return rows as any;
}

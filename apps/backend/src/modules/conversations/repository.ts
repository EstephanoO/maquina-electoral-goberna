import { pool } from "../../db";
import type { UpsertMessageInput, ClassifyConversationInput } from "./schemas";

// ═══════════════════════════════════════════════════════════════════════
// CONVERSATIONS REPOSITORY
//
// Invariants:
//   1. (campaign_id, own_number, jid) is unique — one conversation per contact per phone line
//   2. owner_id is set on first outbound message and never changed
//   3. Classification can only be set once by auto; manual always overrides
//   4. Messages array capped at 50 entries (oldest trimmed)
//   5. Phone resolution is best-effort; updated whenever a better value arrives
// ═══════════════════════════════════════════════════════════════════════

const MAX_MESSAGES = 50;

export type ConversationRow = {
  id: string;
  campaign_id: string;
  own_number: string;
  jid: string;
  phone: string | null;
  contact_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  messages: Array<{ d: string; t: string; ts: number; op?: string }>;
  message_count: number;
  inbound_count: number;
  vote_class: string | null;
  status: string | null;
  category: string | null;
  confidence: number | null;
  reason: string | null;
  classified_at: string | null;
  classified_by: string;
  validation_id: string | null;
  created_at: string;
  updated_at: string;
};

// ── Upsert a message into a conversation ─────────────────────────────
// Atomic: INSERT ... ON CONFLICT UPDATE.
// - Creates conversation if new
// - Appends message to JSONB array (capped at MAX_MESSAGES)
// - Sets owner_id on first outbound message (COALESCE — never overwrites)
// - Updates phone/contact_name if better values arrive
// - Increments counters
export async function upsertMessage(
  campaignId: string,
  operatorId: string,
  operatorName: string,
  input: UpsertMessageInput,
): Promise<{ conversation_id: number; is_new: boolean; message_count: number; inbound_count: number }> {
  const msgEntry = JSON.stringify({
    d: input.direction,
    t: (input.text || "").slice(0, 2000),
    ts: input.timestamp || Date.now(),
    ...(input.direction === "out" ? { op: operatorId } : {}),
  });

  const isOut = input.direction === "out";

  const { rows } = await pool.query<{
    id: string;
    is_new: boolean;
    message_count: number;
    inbound_count: number;
  }>(`
    INSERT INTO conversations (
      campaign_id, own_number, jid, phone, contact_name,
      owner_id, owner_name,
      messages, message_count, inbound_count
    ) VALUES (
      $1, $2, $3, $4, $5,
      ${isOut ? "$6" : "NULL"}, ${isOut ? "$7" : "NULL"},
      jsonb_build_array($8::jsonb), 1, ${isOut ? "0" : "1"}
    )
    ON CONFLICT (campaign_id, own_number, jid) DO UPDATE SET
      -- Append message, cap at ${MAX_MESSAGES}
      messages = CASE
        WHEN jsonb_array_length(conversations.messages) >= ${MAX_MESSAGES}
        THEN (conversations.messages - 0) || jsonb_build_array($8::jsonb)
        ELSE conversations.messages || jsonb_build_array($8::jsonb)
      END,
      message_count = conversations.message_count + 1,
      inbound_count = conversations.inbound_count + ${isOut ? "0" : "1"},
      -- Owner: first outbound operator wins (COALESCE = never overwrite)
      owner_id = ${isOut ? "COALESCE(conversations.owner_id, $6)" : "conversations.owner_id"},
      owner_name = ${isOut ? "COALESCE(conversations.owner_name, $7)" : "conversations.owner_name"},
      -- Phone: update if we have a better value (non-null replaces null)
      phone = COALESCE($4, conversations.phone),
      -- Contact name: update if we have a better value
      contact_name = COALESCE($5, conversations.contact_name),
      updated_at = now()
    RETURNING
      id::text,
      (xmax = 0) as is_new,
      message_count,
      inbound_count
  `, [
    campaignId,           // $1
    input.own_number,     // $2
    input.jid,            // $3
    input.phone || null,  // $4
    input.contact_name || null, // $5
    operatorId,           // $6
    operatorName,         // $7
    msgEntry,             // $8
  ]);

  const row = rows[0]!;
  return {
    conversation_id: parseInt(row.id, 10),
    is_new: row.is_new,
    message_count: row.message_count,
    inbound_count: row.inbound_count,
  };
}

// ── Classify a conversation ──────────────────────────────────────────
// Rules:
//   - If already classified by 'auto', 'auto' cannot overwrite
//   - 'manual' always overrides (operator correction)
//   - Updates linked form_validation if exists
export async function classify(
  campaignId: string,
  input: ClassifyConversationInput,
): Promise<{ updated: boolean; reason?: string }> {
  // Check current state
  const { rows: current } = await pool.query<{
    classified_by: string;
    vote_class: string | null;
    phone: string | null;
    validation_id: string | null;
  }>(`
    SELECT classified_by, vote_class, phone, validation_id::text
    FROM conversations
    WHERE id = $1 AND campaign_id = $2
  `, [input.conversation_id, campaignId]);

  if (current.length === 0) {
    return { updated: false, reason: "conversation_not_found" };
  }

  const conv = current[0]!;

  // Auto cannot override existing classification (auto or manual)
  if (input.source === "auto" && conv.classified_by !== "pending") {
    return { updated: false, reason: "already_classified" };
  }

  // Apply classification
  await pool.query(`
    UPDATE conversations SET
      vote_class = $3,
      status = $4,
      category = $5,
      confidence = $6,
      reason = $7,
      classified_at = now(),
      classified_by = $8,
      updated_at = now()
    WHERE id = $1 AND campaign_id = $2
  `, [
    input.conversation_id,
    campaignId,
    input.vote_class || null,
    input.status || null,
    input.category || null,
    input.confidence,
    input.reason || null,
    input.source,
  ]);

  // If conversation has a linked validation, update it too
  if (conv.validation_id && input.vote_class) {
    await pool.query(`
      UPDATE form_validations SET
        vote_class = $2,
        status = CASE WHEN $3 != '' THEN $3 ELSE status END,
        notes = COALESCE(notes, '') || E'\n' || $4,
        updated_at = now()
      WHERE id = $1
    `, [
      conv.validation_id,
      input.vote_class,
      input.status || "",
      `[AUTO-CONV] ${input.category}: ${input.reason} (conf: ${input.confidence})`,
    ]);
  }

  return { updated: true };
}

// ── Try to link conversation to a form_validation by phone ───────────
// Called when phone is first resolved for a conversation.
// Uses suffix match (last 9 digits) to handle Peru format variations.
export async function tryLinkValidation(
  conversationId: number,
  campaignId: string,
  phone: string,
): Promise<{ linked: boolean; validation_id?: string }> {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return { linked: false };
  const suffix = digits.slice(-9);

  // Find the best matching validation (prefer unclaimed, then most recent)
  const { rows } = await pool.query<{ id: string }>(`
    SELECT id::text FROM form_validations
    WHERE campaign_id = $1
      AND (telefono = $2 OR telefono = $3 OR RIGHT(telefono, 9) = $4)
    ORDER BY
      CASE WHEN claimed_by IS NULL THEN 0 ELSE 1 END,
      updated_at DESC
    LIMIT 1
  `, [campaignId, digits, phone, suffix]);

  if (rows.length === 0) return { linked: false };

  const validationId = rows[0]!.id;

  // Link — but don't overwrite if already linked to a different validation
  const { rowCount } = await pool.query(`
    UPDATE conversations SET
      validation_id = $2,
      updated_at = now()
    WHERE id = $1 AND validation_id IS NULL
  `, [conversationId, validationId]);

  return { linked: (rowCount ?? 0) > 0, validation_id: validationId };
}

// ── Get a conversation by ID ─────────────────────────────────────────
export async function getById(
  conversationId: number,
  campaignId: string,
): Promise<ConversationRow | null> {
  const { rows } = await pool.query<ConversationRow>(`
    SELECT
      id::text, campaign_id::text, own_number, jid, phone, contact_name,
      owner_id::text, owner_name,
      messages, message_count, inbound_count,
      vote_class, status, category, confidence, reason,
      classified_at::text, classified_by,
      validation_id::text,
      created_at::text, updated_at::text
    FROM conversations
    WHERE id = $1 AND campaign_id = $2
  `, [conversationId, campaignId]);

  return rows[0] ?? null;
}

// ── List conversations for a campaign ────────────────────────────────
export async function list(
  campaignId: string,
  opts: {
    classified_by?: string;
    owner_id?: string;
    has_inbound?: boolean;
    limit: number;
    offset: number;
  },
): Promise<{ items: ConversationRow[]; total: number }> {
  const conditions = ["c.campaign_id = $1"];
  const params: (string | number | boolean)[] = [campaignId];
  let paramIdx = 2;

  if (opts.classified_by && opts.classified_by !== "all") {
    conditions.push(`c.classified_by = $${paramIdx}`);
    params.push(opts.classified_by);
    paramIdx++;
  }
  if (opts.owner_id) {
    conditions.push(`c.owner_id = $${paramIdx}`);
    params.push(opts.owner_id);
    paramIdx++;
  }
  if (opts.has_inbound) {
    conditions.push("c.inbound_count > 0");
  }

  const where = conditions.join(" AND ");

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM conversations c WHERE ${where}`,
    params,
  );
  const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

  const { rows } = await pool.query<ConversationRow>(`
    SELECT
      c.id::text, c.campaign_id::text, c.own_number, c.jid, c.phone, c.contact_name,
      c.owner_id::text, c.owner_name,
      c.messages, c.message_count, c.inbound_count,
      c.vote_class, c.status, c.category, c.confidence, c.reason,
      c.classified_at::text, c.classified_by,
      c.validation_id::text,
      c.created_at::text, c.updated_at::text
    FROM conversations c
    WHERE ${where}
    ORDER BY c.updated_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `, [...params, opts.limit, opts.offset]);

  return { items: rows, total };
}

// ── Stats for dashboard ──────────────────────────────────────────────
export async function stats(campaignId: string): Promise<{
  total: number;
  with_inbound: number;
  classified: number;
  pending: number;
  by_vote_class: Record<string, number>;
  by_owner: Array<{ owner_id: string; owner_name: string; count: number; classified: number }>;
}> {
  const { rows: totals } = await pool.query<{
    total: string;
    with_inbound: string;
    classified: string;
    pending: string;
  }>(`
    SELECT
      COUNT(*)::text as total,
      COUNT(*) FILTER (WHERE inbound_count > 0)::text as with_inbound,
      COUNT(*) FILTER (WHERE classified_by != 'pending')::text as classified,
      COUNT(*) FILTER (WHERE classified_by = 'pending' AND inbound_count > 0)::text as pending
    FROM conversations
    WHERE campaign_id = $1
  `, [campaignId]);

  const t = totals[0]!;

  const { rows: vcRows } = await pool.query<{ vote_class: string; count: string }>(`
    SELECT COALESCE(vote_class, 'sin_clasificar') as vote_class, COUNT(*)::text as count
    FROM conversations
    WHERE campaign_id = $1 AND classified_by != 'pending'
    GROUP BY vote_class
  `, [campaignId]);

  const by_vote_class: Record<string, number> = {};
  for (const r of vcRows) by_vote_class[r.vote_class] = parseInt(r.count, 10);

  const { rows: ownerRows } = await pool.query<{
    owner_id: string;
    owner_name: string;
    count: string;
    classified: string;
  }>(`
    SELECT
      owner_id::text,
      COALESCE(owner_name, 'Desconocido') as owner_name,
      COUNT(*)::text as count,
      COUNT(*) FILTER (WHERE classified_by != 'pending')::text as classified
    FROM conversations
    WHERE campaign_id = $1 AND owner_id IS NOT NULL
    GROUP BY owner_id, owner_name
    ORDER BY count DESC
  `, [campaignId]);

  return {
    total: parseInt(t.total, 10),
    with_inbound: parseInt(t.with_inbound, 10),
    classified: parseInt(t.classified, 10),
    pending: parseInt(t.pending, 10),
    by_vote_class,
    by_owner: ownerRows.map(r => ({
      owner_id: r.owner_id,
      owner_name: r.owner_name,
      count: parseInt(r.count, 10),
      classified: parseInt(r.classified, 10),
    })),
  };
}

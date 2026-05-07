import { Router } from "express";
import { sql } from "../sql.js";
import { safe } from "../middleware/safe.js";
import type { AuthedRequest } from "../auth.js";

/**
 * Extraction candidates: scanea outbounds manuales del operador con regex,
 * agrupa valores normalizados y crea/upserta candidates. Operador revisa
 * y aprueba — recién ahí se aplica al destino correspondiente. Cola de
 * revisión (no auto-apply) — el incidente del password mostró que mandar
 * info única en bulk puede sobrescribir cosas que no deberían cambiar.
 *
 *   POST /admin/extraction/run                   — scan + upsert candidates
 *   GET  /admin/extraction/candidates?kind=...   — listado para review
 *   POST /admin/extraction/approve/:id           — aplica al destino
 *   POST /admin/extraction/reject/:id
 */
export const adminExtractionRouter = Router();

adminExtractionRouter.post("/admin/extraction/run", safe(async (req, res) => {
  const { extractAll } = await import("../lib/extractors.js");
  const { since_days, bot_instance_id } = req.body ?? {};
  const sinceDays = Math.min(Math.max(Number(since_days) || 30, 1), 365);

  // Filtra por línea (assigned_to del lead) si bot_instance_id se pasa.
  let assignedFilter = sql`TRUE`;
  let botInstanceId: number | null = null;
  if (bot_instance_id) {
    const inst = await sql`SELECT id, phone FROM bot_instances WHERE id = ${Number(bot_instance_id)}`;
    if (inst.length > 0 && inst[0].phone) {
      assignedFilter = sql`l.assigned_to = ${inst[0].phone}`;
      botInstanceId = inst[0].id;
    }
  }

  const rows = await sql`
    SELECT i.id, i.body
    FROM interactions i
    JOIN leads l ON l.id = i.lead_id
    WHERE i.kind = 'message_out'
      AND COALESCE((i.meta->>'auto_reply')::boolean, false) = false
      AND i.created_at > now() - (${sinceDays}::int || ' days')::interval
      AND ${assignedFilter}
      AND i.body IS NOT NULL AND length(i.body) > 5
    ORDER BY i.created_at DESC LIMIT 5000
  `;

  type Agg = {
    kind: string;
    value_normalized: string;
    value_raw: string;
    value_meta: any;
    msgIds: number[];
    samples: string[];
  };
  const agg = new Map<string, Agg>();
  for (const r of rows) {
    const matches = extractAll(r.body as string);
    for (const m of matches) {
      const key = `${m.kind}:${m.value_normalized}`;
      const existing = agg.get(key);
      if (existing) {
        existing.msgIds.push(r.id);
        if (existing.samples.length < 3) existing.samples.push(((r.body as string) || "").slice(0, 200));
      } else {
        agg.set(key, {
          kind: m.kind,
          value_normalized: m.value_normalized,
          value_raw: m.value_raw,
          value_meta: m.value_meta ?? {},
          msgIds: [r.id],
          samples: [((r.body as string) || "").slice(0, 200)],
        });
      }
    }
  }

  // Upsert. Confidence = min(occurrences / 3, 1.0).
  let inserted = 0, updated = 0;
  for (const a of agg.values()) {
    const occ = a.msgIds.length;
    const conf = Math.min(occ / 3, 1.0);
    const result = await sql`
      INSERT INTO extraction_candidates (
        kind, value_raw, value_normalized, value_meta,
        occurrences, confidence, source_message_ids, sample_texts,
        bot_instance_id, last_seen_at
      ) VALUES (
        ${a.kind}, ${a.value_raw}, ${a.value_normalized}, ${sql.json(a.value_meta)},
        ${occ}, ${conf}, ${a.msgIds}, ${a.samples},
        ${botInstanceId}, now()
      )
      ON CONFLICT (kind, value_normalized, COALESCE(bot_instance_id, 0))
      DO UPDATE SET
        occurrences        = extraction_candidates.occurrences + EXCLUDED.occurrences,
        confidence         = LEAST((extraction_candidates.occurrences + EXCLUDED.occurrences) / 3.0, 1.0),
        source_message_ids = (extraction_candidates.source_message_ids || EXCLUDED.source_message_ids)[1:50],
        sample_texts       = CASE
          WHEN cardinality(extraction_candidates.sample_texts) < 3
          THEN (extraction_candidates.sample_texts || EXCLUDED.sample_texts)[1:3]
          ELSE extraction_candidates.sample_texts
        END,
        last_seen_at       = now()
      RETURNING (xmax = 0) AS inserted
    `;
    if (result[0]?.inserted) inserted++; else updated++;
  }

  res.json({
    scanned_messages: rows.length,
    unique_values: agg.size,
    inserted,
    updated,
  });
}));

adminExtractionRouter.get("/admin/extraction/candidates", safe(async (req, res) => {
  const { kind, status, bot_instance_id } = req.query as any;
  const rows = await sql`
    SELECT * FROM extraction_candidates
    WHERE (${kind ?? null}::text IS NULL OR kind = ${kind ?? null})
      AND (${status ?? null}::text IS NULL OR status = ${status ?? null})
      AND (${bot_instance_id ?? null}::int IS NULL OR bot_instance_id = ${bot_instance_id ?? null}::int)
    ORDER BY status = 'pending' DESC, confidence DESC, last_seen_at DESC
    LIMIT 200
  `;
  res.json({ candidates: rows });
}));

// Por ahora aplica targets:
//   { type: "instance.cuenta_bancaria", instance_id }
//   { type: "instance.yape_numero", instance_id }
//   { type: "instance.escalation_phone", instance_id }
// Otros shapes se marcan approved sin aplicar.
adminExtractionRouter.post("/admin/extraction/approve/:id", safe(async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { approved_value, target } = req.body ?? {};
  const by = req.user?.email ?? "extraction";

  const c = (await sql`SELECT * FROM extraction_candidates WHERE id = ${id}`)[0];
  if (!c) return res.status(404).json({ error: "not_found" });

  const value = approved_value || c.value_raw;
  const t = target || c.suggested_target;

  let appliedNote: string | null = null;
  if (t && t.type && t.instance_id) {
    const instId = Number(t.instance_id);
    if (t.type === "instance.cuenta_bancaria") {
      await sql`UPDATE bot_instances SET cuenta_bancaria = ${value}, updated_at = now() WHERE id = ${instId}`;
      appliedNote = `cuenta_bancaria updated for instance ${instId}`;
    } else if (t.type === "instance.yape_numero") {
      await sql`UPDATE bot_instances SET yape_numero = ${value}, updated_at = now() WHERE id = ${instId}`;
      appliedNote = `yape_numero updated for instance ${instId}`;
    } else if (t.type === "instance.escalation_phone") {
      await sql`UPDATE bot_instances SET escalation_phone = ${value}, updated_at = now() WHERE id = ${instId}`;
      appliedNote = `escalation_phone updated for instance ${instId}`;
    }
  }

  await sql`
    UPDATE extraction_candidates SET
      status = 'approved',
      approved_value = ${value},
      approved_target = ${t ? sql.json(t) : null},
      applied_at = ${appliedNote ? sql`now()` : null},
      applied_by = ${appliedNote ? by : null}
    WHERE id = ${id}
  `;
  res.json({ ok: true, applied: appliedNote });
}));

adminExtractionRouter.post("/admin/extraction/reject/:id", safe(async (req, res) => {
  const id = Number(req.params.id);
  const reason: string | null = req.body?.reason ?? null;
  await sql`
    UPDATE extraction_candidates SET status = 'rejected', rejected_reason = ${reason}
    WHERE id = ${id}
  `;
  res.json({ ok: true });
}));

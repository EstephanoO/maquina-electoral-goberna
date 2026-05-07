/**
 * Mining review service: NO auto-promueve por defecto. Lista candidates con
 * match_count >= 5 y manda resumen al admin via WhatsApp para review humano.
 *
 * Por qué no auto-promote (post-mortem 2026-05-07):
 *   La primera versión auto-promovió 6 rules con match_count alto, pero el
 *   suggested_pattern del clusterer (3 palabras top-frecuencia) es demasiado
 *   genérico. Match_count alto venía de SPAM ("Te comparto una oportunidad",
 *   un mismo lead pre-canned a centenares), ACKS ("muchas gracias",
 *   "ahora reviso") y base64 garbage de imágenes mal logueadas.
 *   Auto-promote contaminó ai_rules con tags como `intent:comparto` que
 *   matchean cualquier mensaje con esas palabras genéricas.
 *
 *   Lección: el clusterer puede DETECTAR clusters, pero el SIGNIFICADO
 *   semántico requiere ojo humano. El scheduler solo notifica.
 *
 *   AUTO_PROMOTE_THRESHOLD = Infinity efectivamente desactiva auto-promote.
 *   Si en el futuro se quiere reactivar con guards más estrictos (whitelist
 *   de palabras "intent-like", validación de diversidad de samples), bajar
 *   el threshold y agregar checks acá.
 *
 * Usage:
 *   - Cron diario @ 9 AM Lima (services/scheduler.ts) → solo notify
 *   - Manual: POST /admin/mining/run-review
 */
import { sql } from "../sql.js";
import { db } from "../db.js";
import { embedRuleInBackground } from "./embed.js";

export const AUTO_PROMOTE_THRESHOLD = Number.POSITIVE_INFINITY; // efectivamente OFF
const ADMIN_PHONE = process.env.MINING_ADMIN_PHONE || ""; // ej. "+51955135507"
const NOTIFY_INSTANCE = process.env.MINING_NOTIFY_INSTANCE || "p4";
const BOT_URL = () => process.env.BOT_URL || "http://bot:4020";

export interface MiningReviewResult {
  reviewed: number;
  auto_promoted: Array<{ candidate_id: number; rule_id: number; rule_name: string; tag: string; pattern: string; match_count: number }>;
  pending_top: Array<{ id: number; tag: string | null; pattern: string | null; sample: string; match_count: number }>;
  notify_sent: boolean;
  notify_error?: string;
  skipped: Array<{ candidate_id: number; reason: string }>;
}

/** Verifica si ya existe una rule con el mismo pattern (case-insensitive). */
async function ruleExistsForPattern(pattern: string): Promise<boolean> {
  const rows = await sql`
    SELECT id FROM ai_rules
    WHERE LOWER(pattern) = LOWER(${pattern}) LIMIT 1
  `;
  return rows.length > 0;
}

/** Promueve un candidate inline (sin pasar por HTTP route). */
async function promoteCandidate(c: {
  id: number; suggested_tag: string | null; suggested_pattern: string | null;
  sample_texts: string[]; match_count: number;
}, by: string): Promise<{ rule_id: number; rule_name: string }> {
  const finalTag = c.suggested_tag || "intent:custom";
  const finalPattern = c.suggested_pattern || "";
  if (!finalPattern) throw new Error("pattern_required");
  // Validar regex antes de insertar (silenciosamente disabled si es inválido)
  new RegExp(finalPattern);

  const finalName = `mined: ${c.sample_texts[0]?.slice(0, 60) ?? "auto"}`;
  const ruleRows: any = await sql`
    INSERT INTO ai_rules (name, description, pattern, tag, weight, enabled, created_by, source)
    VALUES (
      ${finalName},
      ${`Auto-mined intent (cluster of ${c.match_count} unmatched messages, auto-promoted via mining-review)`},
      ${finalPattern}, ${finalTag},
      1.0, TRUE, ${by}, 'mined-auto'
    ) RETURNING id, name`;
  const ruleId = ruleRows[0].id;

  // Embedding async — no bloquear el cron. Si falla, el rule sigue funcionando
  // en regex mode (semantic fallback no lo usa hasta que se embeda).
  embedRuleInBackground(ruleId, ruleRows[0].name);
  await db.promoteMiningCandidate(c.id, ruleId, by);

  return { rule_id: ruleId, rule_name: ruleRows[0].name };
}

/** Manda WhatsApp al admin via el bot. Best-effort — si falla, retorna error. */
async function notifyAdmin(text: string): Promise<{ ok: boolean; error?: string }> {
  if (!ADMIN_PHONE) return { ok: false, error: "ADMIN_PHONE not configured" };
  try {
    const r = await fetch(`${BOT_URL()}/send/${NOTIFY_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: ADMIN_PHONE, message: text }),
    });
    if (!r.ok) {
      const j: any = await r.json().catch(() => ({}));
      return { ok: false, error: j?.error || `http_${r.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "fetch_failed" };
  }
}

export async function runMiningReview(triggeredBy: string = "cron"): Promise<MiningReviewResult> {
  const candidates = await db.listMiningCandidates("pending");

  const result: MiningReviewResult = {
    reviewed: candidates.length,
    auto_promoted: [],
    pending_top: [],
    notify_sent: false,
    skipped: [],
  };

  for (const c of candidates) {
    if (c.match_count < AUTO_PROMOTE_THRESHOLD) continue;
    if (!c.suggested_pattern || !c.suggested_tag) {
      result.skipped.push({ candidate_id: c.id, reason: "no_suggested_pattern_or_tag" });
      continue;
    }
    if (await ruleExistsForPattern(c.suggested_pattern)) {
      result.skipped.push({ candidate_id: c.id, reason: "duplicate_pattern" });
      // Marcamos rejected para que no se vuelva a evaluar.
      await db.rejectMiningCandidate(c.id, "mining-review:duplicate");
      continue;
    }
    try {
      const promoted = await promoteCandidate(c as any, `mining-review:${triggeredBy}`);
      result.auto_promoted.push({
        candidate_id: c.id,
        rule_id: promoted.rule_id,
        rule_name: promoted.rule_name,
        tag: c.suggested_tag,
        pattern: c.suggested_pattern,
        match_count: c.match_count,
      });
    } catch (e: any) {
      result.skipped.push({ candidate_id: c.id, reason: `promote_failed: ${e?.message ?? "unknown"}` });
    }
  }

  // Top pending = los que NO se auto-promovieron, con match_count >= 5
  const promotedIds = new Set(result.auto_promoted.map(p => p.candidate_id));
  const skippedIds = new Set(result.skipped.map(s => s.candidate_id));
  result.pending_top = candidates
    .filter(c => !promotedIds.has(c.id) && !skippedIds.has(c.id) && c.match_count >= 5)
    .slice(0, 10)
    .map(c => ({
      id: c.id,
      tag: c.suggested_tag,
      pattern: c.suggested_pattern,
      sample: c.sample_texts?.[0]?.slice(0, 80) ?? "",
      match_count: c.match_count,
    }));

  // Notify admin si hay algo que reportar
  if (ADMIN_PHONE && (result.auto_promoted.length > 0 || result.pending_top.length > 0)) {
    const lines: string[] = [];
    lines.push(`🤖 *Mining review* (${triggeredBy})`);
    if (result.auto_promoted.length > 0) {
      lines.push(`\n✅ Auto-promovidos: ${result.auto_promoted.length}`);
      for (const p of result.auto_promoted.slice(0, 5)) {
        lines.push(`  • ${p.tag} (${p.match_count} hits)`);
      }
    }
    if (result.pending_top.length > 0) {
      lines.push(`\n👀 Pendientes para revisar: ${result.pending_top.length}`);
      for (const p of result.pending_top.slice(0, 5)) {
        lines.push(`  • ${p.tag || "?"} (${p.match_count}): "${p.sample}"`);
      }
      lines.push(`\nReview UI: https://crm.goberna.club/admin/mining`);
    }
    const notify = await notifyAdmin(lines.join("\n"));
    result.notify_sent = notify.ok;
    if (!notify.ok) result.notify_error = notify.error;
  }

  return result;
}

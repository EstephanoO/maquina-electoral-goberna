/**
 * One-shot import of the legacy JSON file (nexus.db.json) into Postgres.
 *
 * Usage:  npm run import-json
 *
 * Safe to re-run: uses ON CONFLICT to skip duplicates.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "./sql.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, "..", "nexus.db.json");

async function run() {
  if (!existsSync(JSON_PATH)) {
    console.log("[import] no nexus.db.json found, nothing to import");
    return;
  }
  const raw = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  const leads = raw.leads ?? [];
  const interactions = raw.interactions ?? [];
  const templates = raw.templates ?? [];
  const sends = raw.sends ?? [];

  console.log(`[import] ${leads.length} leads, ${interactions.length} interactions, ${templates.length} templates, ${sends.length} sends`);

  const idMap = new Map<number, number>(); // old -> new lead id

  for (const l of leads) {
    const rows = await sql`
      INSERT INTO leads (
        name, phone, course, level, last_purchase_year,
        stage, notes, tags, source, assigned_to, captured_by_phone,
        created_at, updated_at
      ) VALUES (
        ${l.name}, ${l.phone}, ${l.course}, ${l.level}, ${l.last_purchase_year},
        ${l.stage}, ${l.notes}, ${l.tags ?? []}, ${l.source ?? "whatsapp"},
        ${l.assigned_to}, ${l.captured_by_phone ?? null},
        ${l.created_at ? new Date(l.created_at.replace(" ", "T") + "Z") : null},
        ${l.updated_at ? new Date(l.updated_at.replace(" ", "T") + "Z") : null}
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (rows[0]) idMap.set(l.id, rows[0].id);
  }

  for (const it of interactions) {
    const newLeadId = idMap.get(it.lead_id);
    if (!newLeadId) continue;
    await sql`
      INSERT INTO interactions (lead_id, kind, body, meta, by_user, created_at)
      VALUES (
        ${newLeadId}, ${it.kind}, ${it.body},
        ${it.meta ? sql.json(it.meta) : null},
        ${it.by}, ${it.created_at ? new Date(it.created_at.replace(" ", "T") + "Z") : null}
      )
    `;
  }

  for (const t of templates) {
    await sql`
      INSERT INTO templates (name, body, created_at, updated_at)
      VALUES (
        ${t.name}, ${t.body},
        ${t.created_at ? new Date(t.created_at.replace(" ", "T") + "Z") : null},
        ${t.updated_at ? new Date(t.updated_at.replace(" ", "T") + "Z") : null}
      )
    `;
  }

  for (const s of sends) {
    const newLeadId = idMap.get(s.lead_id);
    if (!newLeadId) continue;
    await sql`
      INSERT INTO sends (lead_id, body, status, error, assigned_to, created_at, sent_at)
      VALUES (
        ${newLeadId}, ${s.body}, ${s.status}, ${s.error}, ${s.assigned_to},
        ${s.created_at ? new Date(s.created_at.replace(" ", "T") + "Z") : null},
        ${s.sent_at ? new Date(s.sent_at.replace(" ", "T") + "Z") : null}
      )
    `;
  }

  console.log("[import] ✓ done");
}

run()
  .then(() => sql.end())
  .catch((err) => { console.error("[import] failed:", err); process.exit(1); });

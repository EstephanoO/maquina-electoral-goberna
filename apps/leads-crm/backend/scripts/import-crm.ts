/**
 * Import Goberna CRM data (personas + transacciones) into leads table.
 * Matches by phone number. Enriches existing WA-synced leads with purchase data.
 *
 * Usage: npx tsx scripts/import-crm.ts /path/to/personas.csv /path/to/transacciones.csv
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { sql } from "../src/sql.js";

const PERSONAS_FILE = process.argv[2] || "/tmp/personas.csv";
const TXNS_FILE = process.argv[3] || "/tmp/transacciones.csv";

function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  return d.length >= 7 ? "+" + d : null;
}

const COUNTRY_MAP: Record<string, string> = {
  PE: "Perú", MX: "México", EC: "Ecuador", BO: "Bolivia",
  CO: "Colombia", GT: "Guatemala", DO: "República Dominicana",
  HN: "Honduras", PA: "Panamá", CL: "Chile", AR: "Argentina",
  BR: "Brasil", US: "Estados Unidos", CR: "Costa Rica", PY: "Paraguay",
  UY: "Uruguay", VE: "Venezuela", NI: "Nicaragua", SV: "El Salvador",
  CU: "Cuba", PR: "Puerto Rico",
};

function buyerTier(nSales: number, usd: number): string {
  if (nSales >= 5 || usd >= 500) return "vip";
  if (nSales >= 2) return "repeat";
  if (nSales >= 1) return "single";
  return "prospect";
}

async function parseCsv(file: string): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  const rl = createInterface({ input: createReadStream(file, "utf8") });
  let headers: string[] = [];
  let first = true;
  for await (const line of rl) {
    if (first) { headers = line.split(","); first = false; continue; }
    const vals = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h.trim()] = (vals[i] || "").trim(); });
    rows.push(row);
  }
  return rows;
}

async function main() {
  console.log("Loading personas...");
  const personas = await parseCsv(PERSONAS_FILE);
  console.log(`  ${personas.length} personas loaded`);

  // Build phone→persona index
  const byPhone = new Map<string, typeof personas[0]>();
  for (const p of personas) {
    const phone = normalizePhone(p.telefono || p.primary_phone);
    if (phone) byPhone.set(phone.replace(/\D/g, ""), p);
  }
  console.log(`  ${byPhone.size} with phone`);

  // Phase 1: Update existing leads with purchase data
  const existingLeads = await sql`SELECT id, phone, email, name FROM leads`;
  console.log(`\nExisting leads in DB: ${existingLeads.length}`);
  let enriched = 0, newCreated = 0;

  for (const lead of existingLeads) {
    const phoneDigits = (lead.phone || "").replace(/\D/g, "");
    const persona = byPhone.get(phoneDigits);
    if (!persona) continue;

    const nSales = parseInt(persona.n_ventas || "0") || 0;
    const usd = parseFloat(persona.total_usd_gastado || "0") || 0;
    const email = persona.email || persona.primary_email || null;
    const tier = buyerTier(nSales, usd);
    const firstPurchase = persona.primer_venta || null;

    // Update name if lead has "Sin nombre" and persona has a name
    const personaName = [persona.nombre || persona.primary_nombre, persona.apellido || persona.primary_apellido]
      .filter(Boolean).join(" ").trim();
    const updateName = lead.name === "Sin nombre" && personaName ? personaName : null;

    await sql`
      UPDATE leads SET
        total_usd_spent = ${usd},
        n_purchases = ${nSales},
        first_purchase_at = ${firstPurchase ? new Date(firstPurchase).toISOString() : null},
        email = COALESCE(${email}, email),
        buyer_tier = ${tier}
        ${updateName ? sql`, name = ${updateName}` : sql``}
      WHERE id = ${lead.id}
    `;
    enriched++;
    byPhone.delete(phoneDigits); // Remove so we don't re-create
  }
  console.log(`  Enriched: ${enriched} existing leads`);

  // Phase 2: Create new leads from personas NOT already in DB
  const remaining = [...byPhone.entries()];
  console.log(`\nNew personas to import: ${remaining.length}`);

  let batch = 0;
  for (const [phoneDigits, p] of remaining) {
    const phone = "+" + phoneDigits;
    const name = [p.nombre || p.primary_nombre, p.apellido || p.primary_apellido]
      .filter(Boolean).join(" ").trim() || "Sin nombre";
    const email = p.email || p.primary_email || null;
    const pais = COUNTRY_MAP[p.pais || p.primary_pais_iso2 || ""] || null;
    const nSales = parseInt(p.n_ventas || "0") || 0;
    const usd = parseFloat(p.total_usd_gastado || "0") || 0;
    const tier = buyerTier(nSales, usd);
    const firstLead = p.primer_lead || null;
    const firstPurchase = p.primer_venta || null;
    const stage = nSales > 0 ? "sold" : "new";

    try {
      await sql`
        INSERT INTO leads (name, phone, email, country, stage, source, total_usd_spent, n_purchases, first_purchase_at, buyer_tier)
        VALUES (${name}, ${phone}, ${email}, ${pais}, ${stage}, 'crm_import',
                ${usd}, ${nSales}, ${firstPurchase ? new Date(firstPurchase).toISOString() : null}, ${tier})
      `;
      newCreated++;
    } catch (e: any) {
      if (e?.code !== "23505") console.warn(`  Skip ${phone}: ${e?.message?.slice(0, 60)}`);
    }

    batch++;
    if (batch % 5000 === 0) console.log(`  ... ${batch}/${remaining.length}`);
  }
  console.log(`  Created: ${newCreated} new leads`);

  // Summary
  const [totals] = await sql`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN buyer_tier = 'vip' THEN 1 ELSE 0 END) AS vips,
      SUM(CASE WHEN buyer_tier = 'repeat' THEN 1 ELSE 0 END) AS repeats,
      SUM(CASE WHEN buyer_tier = 'single' THEN 1 ELSE 0 END) AS singles,
      SUM(CASE WHEN buyer_tier = 'prospect' THEN 1 ELSE 0 END) AS prospects,
      SUM(total_usd_spent) AS total_usd
    FROM leads
  `;
  console.log(`\n=== FINAL ===`);
  console.log(`  Total leads: ${totals.total}`);
  console.log(`  VIPs: ${totals.vips} · Repeat: ${totals.repeats} · Single: ${totals.singles} · Prospect: ${totals.prospects}`);
  console.log(`  Total USD: $${Number(totals.total_usd).toLocaleString()}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

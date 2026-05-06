/**
 * consolidate-escuela-to-leads.ts
 *
 * Cruza el catálogo histórico del ERP de Escuela (electoral DB schema
 * `escuela.*` — clientes que pagaron) con leads-crm.leads (prospects +
 * imports varios) y consolida en una sola tabla.
 *
 * Para cada row de escuela.lead_360:
 *   1. Busca lead en leads-crm por phone (matching last 9 dígitos).
 *   2. Si match → UPDATE con enrichment (name si era placeholder, email,
 *      dni, ocupacion, country, buyer_tier real, total_usd_spent,
 *      n_purchases, last_purchase_year, last_course, escuela_client_id).
 *   3. Si NO match → INSERT nuevo lead con toda la data + source='escuela_erp'.
 *
 * Idempotente: re-correrlo deja el mismo estado (UPSERT-style).
 *
 * Uso:
 *   bun apps/backend/scripts/consolidate-escuela-to-leads.ts
 *
 * Requiere envs:
 *   ELECTORAL_DATABASE_URL  — postgres de electoral (donde está escuela.*)
 *   LEADS_DATABASE_URL      — postgres de leads-crm
 *
 * Ambas DBs corren en el mismo container postgres en el server (different
 * databases, mismo cluster), así que ambas URLs apuntan al mismo host
 * pero distinta DB.
 */

import { Pool } from "pg";

const ELECTORAL_DB_URL = process.env.ELECTORAL_DATABASE_URL;
const LEADS_DB_URL = process.env.LEADS_DATABASE_URL || process.env.DATABASE_URL;

if (!ELECTORAL_DB_URL || !LEADS_DB_URL) {
  console.error("ELECTORAL_DATABASE_URL y LEADS_DATABASE_URL son requeridas");
  process.exit(1);
}

console.log("[consolidate] arrancando…");

const electoralPool = new Pool({ connectionString: ELECTORAL_DB_URL });
const leadsPool = new Pool({ connectionString: LEADS_DB_URL });

// ── Helpers ─────────────────────────────────────────────────────────

/** Normaliza phone a últimos 9 dígitos (formato leads-crm/voter_profiles). */
function normalize9(phone: string): string {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.slice(-9);
}

function fmtPhoneWithPlus(canonical11: string | null): string | null {
  if (!canonical11) return null;
  return canonical11.startsWith("+") ? canonical11 : `+${canonical11}`;
}

function detectCountryFromPrefix(canonical: string | null): string | null {
  if (!canonical) return null;
  const d = canonical.replace(/\D/g, "");
  const prefixes: Array<[string, string]> = [
    ["1809", "República Dominicana"], ["1829", "República Dominicana"], ["1849", "República Dominicana"],
    ["593", "Ecuador"], ["591", "Bolivia"], ["595", "Paraguay"], ["598", "Uruguay"],
    ["506", "Costa Rica"], ["502", "Guatemala"], ["503", "El Salvador"],
    ["504", "Honduras"], ["505", "Nicaragua"], ["507", "Panamá"],
    ["51", "Perú"], ["52", "México"], ["57", "Colombia"], ["56", "Chile"],
    ["54", "Argentina"], ["58", "Venezuela"], ["55", "Brasil"], ["53", "Cuba"],
    ["34", "España"], ["1", "EEUU/Canadá"],
  ];
  for (const [p, c] of prefixes) if (d.startsWith(p)) return c;
  return null;
}

function buyerTierToStage(tier: string): string {
  // Pipeline real del user: contactado/interesado/vendido/entregado/seguimiento/recontacto/revendido/perdido
  // Mapeo desde lo que sabemos del ERP:
  switch (tier) {
    case "vip":
    case "repeat": return "resold";       // 2+ compras → "revendido"
    case "single": return "delivered";    // 1 compra completada
    case "prospect": return "interested"; // tuvo contacto pero no compró
    default: return "new";
  }
}

// ── Main ────────────────────────────────────────────────────────────

type Lead360 = {
  canonical_phone: string;
  client_id: string;
  codigo_cliente: string;
  nombre: string;
  apellido: string;
  nombre_completo: string;
  dni: string | null;
  ocupacion: string | null;
  tratamiento: string | null;
  fecha_nacimiento: string | null;
  first_registered_at: string | null;
  email_principal: string | null;
  sales_count: string;
  sales_total: string;
  last_purchase_at: string | null;
  enrollments_count: string;
  active_enrollments: string;
  last_enrolled_course: string | null;
  certificates_count: string;
  buyer_tier: string;
};

async function main() {
  // 1. Pull todo el lead_360 de electoral
  console.log("[consolidate] leyendo escuela.lead_360 de electoral…");
  const { rows: clients } = await electoralPool.query<Lead360>(`
    SELECT
      canonical_phone,
      client_id::text,
      codigo_cliente,
      COALESCE(nombre, '') AS nombre,
      COALESCE(apellido, '') AS apellido,
      nombre_completo,
      dni,
      ocupacion,
      tratamiento,
      fecha_nacimiento::text,
      first_registered_at::text,
      email_principal,
      sales_count::text,
      sales_total::text,
      last_purchase_at::text,
      enrollments_count::text,
      active_enrollments::text,
      last_enrolled_course,
      certificates_count::text,
      buyer_tier
    FROM escuela.lead_360
    WHERE canonical_phone IS NOT NULL AND length(canonical_phone) >= 9
  `);
  console.log(`[consolidate] ${clients.length} clientes con phone válido a procesar`);

  let matched = 0;
  let updated = 0;
  let created = 0;
  let skipped = 0;

  for (const c of clients) {
    const last9 = c.canonical_phone.slice(-9);
    const phoneFull = fmtPhoneWithPlus(c.canonical_phone);
    const country = detectCountryFromPrefix(c.canonical_phone);
    const stage = buyerTierToStage(c.buyer_tier);
    const purchaseYear = c.last_purchase_at ? new Date(c.last_purchase_at).getFullYear() : null;
    const totalUsd = parseFloat(c.sales_total) || 0;
    const nPurch = parseInt(c.sales_count, 10) || 0;

    // 2. Lookup en leads-crm por phone (matchea con o sin "+" + diferentes formatos)
    const { rows: leadRows } = await leadsPool.query<{ id: number; name: string; phone: string | null }>(`
      SELECT id, name, phone FROM leads
       WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') ILIKE '%' || $1
       ORDER BY id ASC
       LIMIT 1
    `, [last9]);

    if (leadRows.length > 0) {
      // 3. UPDATE con enrichment (sin pisar valores manuales no-vacíos)
      const lead = leadRows[0]!;
      const namePlaceholder = !lead.name || lead.name === lead.phone || /^\+?\d+$/.test(lead.name);
      const newName = namePlaceholder ? c.nombre_completo : lead.name;

      await leadsPool.query(`
        UPDATE leads SET
          name = $1,
          dni = COALESCE(NULLIF(dni, ''), $2),
          ocupacion = COALESCE(NULLIF(ocupacion, ''), $3),
          fecha_nacimiento = COALESCE(fecha_nacimiento, $4),
          country = COALESCE(NULLIF(country, ''), $5),
          email = COALESCE(NULLIF(email, ''), $6),
          buyer_tier = $7,
          total_usd_spent = $8,
          n_purchases = $9,
          last_purchase_year = COALESCE($10, last_purchase_year),
          last_course = COALESCE($11, last_course),
          enrollments_count = $12,
          certificates_count = $13,
          escuela_client_id = $14,
          stage = CASE WHEN stage IN ('new', 'contacted') THEN $15 ELSE stage END,
          updated_at = now()
        WHERE id = $16
      `, [
        newName,
        c.dni && c.dni.trim() ? c.dni.trim() : null,
        c.ocupacion,
        c.fecha_nacimiento,
        country,
        c.email_principal,
        c.buyer_tier,
        totalUsd,
        nPurch,
        purchaseYear,
        c.last_enrolled_course,
        parseInt(c.enrollments_count, 10) || 0,
        parseInt(c.certificates_count, 10) || 0,
        parseInt(c.client_id, 10),
        stage,
        lead.id,
      ]);

      matched++; updated++;
    } else {
      // 4. CREATE — cliente histórico que no figura como lead
      try {
        await leadsPool.query(`
          INSERT INTO leads (
            name, phone, country, source, stage, priority,
            email, dni, ocupacion, fecha_nacimiento,
            buyer_tier, total_usd_spent, n_purchases, last_purchase_year, first_purchase_at,
            last_course, enrollments_count, certificates_count,
            escuela_client_id, assigned_to,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, 'escuela_erp', $4, 'medium',
            $5, $6, $7, $8,
            $9, $10, $11, $12, $13,
            $14, $15, $16,
            $17, NULL,
            COALESCE($13, now()), now()
          )
          ON CONFLICT DO NOTHING
        `, [
          c.nombre_completo || c.codigo_cliente || `+${c.canonical_phone}`,
          phoneFull,
          country,
          stage,
          c.email_principal,
          c.dni && c.dni.trim() ? c.dni.trim() : null,
          c.ocupacion,
          c.fecha_nacimiento,
          c.buyer_tier,
          totalUsd,
          nPurch,
          purchaseYear,
          c.last_purchase_at,
          c.last_enrolled_course,
          parseInt(c.enrollments_count, 10) || 0,
          parseInt(c.certificates_count, 10) || 0,
          parseInt(c.client_id, 10),
        ]);
        created++;
      } catch (e: any) {
        skipped++;
        if (skipped < 5) console.warn(`[consolidate] skip ${c.codigo_cliente}: ${e.message}`);
      }
    }
  }

  console.log(`
[consolidate] DONE
  total escuela clients:  ${clients.length}
  matched + updated:      ${matched}
  created new:            ${created}
  skipped (errores):      ${skipped}
`);

  // Stats finales
  const stats = await leadsPool.query(`
    SELECT
      count(*)                                               AS total_leads,
      count(*) FILTER (WHERE escuela_client_id IS NOT NULL)  AS con_erp_link,
      count(*) FILTER (WHERE buyer_tier = 'vip')             AS vip,
      count(*) FILTER (WHERE buyer_tier = 'repeat')          AS repeat_,
      count(*) FILTER (WHERE buyer_tier = 'single')          AS single_,
      count(*) FILTER (WHERE source = 'escuela_erp')         AS desde_erp,
      count(*) FILTER (WHERE dni IS NOT NULL AND dni <> '')  AS con_dni,
      count(*) FILTER (WHERE ocupacion IS NOT NULL AND ocupacion <> '') AS con_ocupacion,
      sum(total_usd_spent)::numeric AS revenue_total
    FROM leads
  `);
  console.log("[consolidate] estado leads-crm post-merge:");
  console.log(stats.rows[0]);

  await electoralPool.end();
  await leadsPool.end();
}

main().catch((e) => {
  console.error("[consolidate] FAILED:", e);
  process.exit(1);
});

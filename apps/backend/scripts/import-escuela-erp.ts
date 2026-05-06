/**
 * Import script: MariaDB dump del ERP de Goberna Escuela → Postgres `escuela.*`
 *
 * Uso:
 *   bun apps/backend/scripts/import-escuela-erp.ts <ruta-al-dump.sql>
 *
 * Tablas que importa (subset relevante):
 *   tb_cliente            → escuela.clients
 *   tb_telefono           → escuela.phones        (canonical_phone derivado)
 *   tb_correo             → escuela.emails
 *   tb_producto           → escuela.products
 *   tb_producto_escuela   → escuela.product_schedules
 *   tb_venta              → escuela.sales
 *   tb_pago               → escuela.payments
 *   tb_matricula          → escuela.enrollments
 *   tb_certificado_curso  → escuela.certificates
 *   tb_contact_lead       → escuela.contact_leads
 *
 * Estrategia:
 *   - Lee el .sql como string (6MB, fits in memory).
 *   - Para cada tabla, encuentra `INSERT INTO `tbX` VALUES (...),(...);`
 *   - Tokeniza los tuples respetando quoting MariaDB ('...', '\\'...').
 *   - Hace TRUNCATE escuela.X CASCADE seguido de INSERT en batches de 500.
 *   - Al final hace REFRESH MATERIALIZED VIEW escuela.lead_360.
 *
 * Idempotente: re-correr el script con el mismo dump deja el mismo estado.
 */

import { readFileSync } from "node:fs";
import { Pool } from "pg";

if (process.argv.length < 3) {
  console.error("uso: bun import-escuela-erp.ts <dump.sql>");
  process.exit(1);
}

const DUMP_PATH = process.argv[2]!;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL no configurada");
  process.exit(1);
}

console.log(`[escuela-import] leyendo ${DUMP_PATH}…`);
const dump = readFileSync(DUMP_PATH, "utf8");
console.log(`[escuela-import] tamaño: ${(dump.length / 1024 / 1024).toFixed(1)} MB`);

// ── Parser de MariaDB INSERT VALUES ───────────────────────────────────

type Token = string | null;

function tk(arr: Token[], i: number): Token {
  return i < arr.length ? arr[i] ?? null : null;
}

function findInsertBlock(sql: string, table: string): string | null {
  const marker = `INSERT INTO \`${table}\` VALUES `;
  const start = sql.indexOf(marker);
  if (start < 0) return null;
  const valuesStart = start + marker.length;
  let i = valuesStart;
  let inString = false;
  while (i < sql.length) {
    const c = sql[i]!;
    if (c === "\\" && i + 1 < sql.length) { i += 2; continue; }
    if (c === "'") { inString = !inString; i++; continue; }
    if (!inString && c === ";") {
      if (i + 1 >= sql.length || sql[i + 1] === "\n" || sql[i + 1] === "\r") {
        return sql.slice(valuesStart, i);
      }
    }
    i++;
  }
  return sql.slice(valuesStart);
}

function parseValues(values: string): Token[][] {
  const tuples: Token[][] = [];
  let i = 0;
  const N = values.length;

  while (i < N) {
    while (i < N && (values[i] === " " || values[i] === "," || values[i] === "\n" || values[i] === "\r" || values[i] === "\t")) i++;
    if (i >= N) break;
    if (values[i] !== "(") {
      throw new Error(`expected '(' at ${i}, got ${values[i]}`);
    }
    i++;
    const tuple: Token[] = [];
    while (i < N) {
      while (i < N && (values[i] === " " || values[i] === "\t")) i++;
      const c = values[i]!;
      if (c === ")") { i++; break; }
      if (c === "'") {
        i++;
        let s = "";
        while (i < N) {
          const ch = values[i]!;
          if (ch === "\\" && i + 1 < N) {
            const next = values[i + 1]!;
            if (next === "'") s += "'";
            else if (next === "\\") s += "\\";
            else if (next === "n") s += "\n";
            else if (next === "r") s += "\r";
            else if (next === "t") s += "\t";
            else if (next === '"') s += '"';
            else if (next === "0") s += "\0";
            else s += next;
            i += 2;
            continue;
          }
          if (ch === "'") {
            if (i + 1 < N && values[i + 1] === "'") { s += "'"; i += 2; continue; }
            i++;
            break;
          }
          s += ch;
          i++;
        }
        tuple.push(s);
      } else {
        let s = "";
        while (i < N && values[i] !== "," && values[i] !== ")") { s += values[i]; i++; }
        s = s.trim();
        tuple.push(s === "NULL" || s === "" ? null : s);
      }
      while (i < N && values[i] === " ") i++;
      if (values[i] === ",") i++;
    }
    tuples.push(tuple);
  }

  return tuples;
}

// ── Helpers de coerción ─────────────────────────────────────────────

function toInt(v: Token): number | null {
  if (v === null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function toBigInt(v: Token): string | null {
  if (v === null) return null;
  return /^-?\d+$/.test(v) ? v : null;
}

function toNumeric(v: Token): string | null {
  if (v === null) return null;
  return /^-?\d+(\.\d+)?$/.test(v) ? v : null;
}

function toBool(v: Token): boolean | null {
  if (v === null) return null;
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return null;
}

function toDate(v: Token): string | null {
  if (v === null || v === "0000-00-00") return null;
  return v;
}

function toTimestamp(v: Token): string | null {
  if (v === null || v === "0000-00-00 00:00:00" || v === "0000-00-00 00:00:00.000000") return null;
  return v;
}

function canonicalizePhone(prefijo: Token, numero: Token): string | null {
  const p = (prefijo ?? "").replace(/\D/g, "");
  const n = (numero ?? "").replace(/\D/g, "");
  if (n.length < 8) return null;
  let combined = n.startsWith(p) ? n : p + n;
  if (combined.length > 11) combined = combined.slice(-11);
  return combined;
}

// ── Importer ──────────────────────────────────────────────────────

async function batchInsert(
  pool: Pool,
  table: string,
  columns: string[],
  rows: unknown[][],
  batchSize = 500,
): Promise<void> {
  if (rows.length === 0) {
    console.log(`[escuela-import] ${table}: 0 rows`);
    return;
  }
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const params: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;
    for (const row of batch) {
      const ph = row.map(() => `$${p++}`).join(", ");
      placeholders.push(`(${ph})`);
      for (const v of row) params.push(v);
    }
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders.join(", ")} ON CONFLICT (id) DO NOTHING`;
    await pool.query(sql, params);
  }
  console.log(`[escuela-import] ${table}: ${rows.length} rows`);
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query("BEGIN");

    console.log("[escuela-import] truncating escuela.* …");
    await pool.query(`TRUNCATE
      escuela.contact_leads,
      escuela.certificates,
      escuela.enrollments,
      escuela.payments,
      escuela.sales,
      escuela.product_schedules,
      escuela.products,
      escuela.emails,
      escuela.phones,
      escuela.clients
      RESTART IDENTITY CASCADE
    `);

    await importClients(pool);
    await importPhones(pool);
    await importEmails(pool);
    await importProducts(pool);
    await importProductSchedules(pool);
    await importSales(pool);
    await importPayments(pool);
    await importEnrollments(pool);
    await importCertificates(pool);
    await importContactLeads(pool);

    await pool.query("COMMIT");
    console.log("[escuela-import] commit OK, refrescando lead_360…");

    await pool.query("REFRESH MATERIALIZED VIEW escuela.lead_360");

    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM escuela.clients)         AS clients,
        (SELECT COUNT(*) FROM escuela.phones)          AS phones,
        (SELECT COUNT(*) FROM escuela.emails)          AS emails,
        (SELECT COUNT(*) FROM escuela.products)        AS products,
        (SELECT COUNT(*) FROM escuela.sales)           AS sales,
        (SELECT COUNT(*) FROM escuela.payments)        AS payments,
        (SELECT COUNT(*) FROM escuela.enrollments)     AS enrollments,
        (SELECT COUNT(*) FROM escuela.certificates)    AS certs,
        (SELECT COUNT(*) FROM escuela.contact_leads)   AS contact_leads,
        (SELECT COUNT(*) FROM escuela.lead_360)        AS lead_360_rows,
        (SELECT COUNT(*) FROM escuela.lead_360 WHERE buyer_tier = 'vip')    AS vip,
        (SELECT COUNT(*) FROM escuela.lead_360 WHERE buyer_tier = 'repeat') AS repeat_buyers
    `);
    console.log("[escuela-import] DONE:");
    console.log(stats.rows[0]);
  } catch (err) {
    await pool.query("ROLLBACK").catch(() => {});
    console.error("[escuela-import] FAILED:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// ── Per-table importers ──────────────────────────────────────────

async function importClients(pool: Pool) {
  // Schema MariaDB: id_cliente, codigo_cliente, nombre, apellido, fecha_nacimiento,
  // dni, fecha_registro, fecha_edicion, estado, id_usuario, id_pais, ocupacion,
  // tratamiento, moodle_email, moodle_email_change_reason, moodle_email_updated_at,
  // moodle_email_updated_by, moodle_user_id
  const block = findInsertBlock(dump, "tb_cliente");
  if (!block) return;
  const tuples = parseValues(block);
  const rows = tuples.map((t) => [
    toBigInt(tk(t, 0)),    // id_cliente
    tk(t, 1) ?? "",        // codigo_cliente
    tk(t, 2) ?? "",        // nombre
    tk(t, 3) ?? "",        // apellido
    toDate(tk(t, 4)),      // fecha_nacimiento
    tk(t, 5) ?? "",        // dni
    toTimestamp(tk(t, 6)), // fecha_registro
    toTimestamp(tk(t, 7)), // fecha_edicion
    toInt(tk(t, 8)),       // estado
    tk(t, 11) ?? null,     // ocupacion
    tk(t, 12) ?? null,     // tratamiento
    tk(t, 13) ?? null,     // moodle_email
    toInt(tk(t, 17)),      // moodle_user_id
    toInt(tk(t, 10)),      // pais_id
  ]);
  await batchInsert(pool, "escuela.clients",
    ["id", "codigo_cliente", "nombre", "apellido", "fecha_nacimiento", "dni",
     "fecha_registro", "fecha_edicion", "estado", "ocupacion", "tratamiento",
     "moodle_email", "moodle_user_id", "pais_id"],
    rows);
}

async function importPhones(pool: Pool) {
  // Schema: codigo_telefono, tipo_telefono, prefijo, numero_telefono, codigo_cliente
  const block = findInsertBlock(dump, "tb_telefono");
  if (!block) return;
  const tuples = parseValues(block);
  const rows = tuples.map((t) => [
    toBigInt(tk(t, 0)),
    toBigInt(tk(t, 4)),
    tk(t, 1) ?? null,
    tk(t, 2) ?? null,
    tk(t, 3) ?? null,
    canonicalizePhone(tk(t, 2), tk(t, 3)),
  ]);
  await batchInsert(pool, "escuela.phones",
    ["id", "client_id", "tipo", "prefijo", "numero", "canonical_phone"],
    rows);
}

async function importEmails(pool: Pool) {
  // Schema: codigo_correo, tipo_correo, nombre_correo, codigo_cliente
  const block = findInsertBlock(dump, "tb_correo");
  if (!block) return;
  const tuples = parseValues(block);
  const rows = tuples
    .map((t) => [
      toBigInt(tk(t, 0)),
      toBigInt(tk(t, 3)),
      tk(t, 1) ?? null,
      tk(t, 2) ?? "",
    ])
    .filter((r) => r[3] && (r[3] as string).includes("@"));
  await batchInsert(pool, "escuela.emails",
    ["id", "client_id", "tipo", "email"], rows);
}

async function importProducts(pool: Pool) {
  // Schema: codigo_producto, sku_producto, nombre_producto, precio_normal,
  // precio_promocion, imagen_producto, fecha_registro, estado, codigo_categoria,
  // codigo_division, codigo_negocio, fecha_edicion, id_cohorte_moodle,
  // id_curso_moodle, tipo_matricula
  const block = findInsertBlock(dump, "tb_producto");
  if (!block) return;
  const tuples = parseValues(block);
  const rows = tuples.map((t) => [
    toBigInt(tk(t, 0)),
    tk(t, 1) ?? "",
    tk(t, 2) ?? "",
    toNumeric(tk(t, 3)),
    toNumeric(tk(t, 4)),
    toInt(tk(t, 7)),
    toInt(tk(t, 8)),
    toDate(tk(t, 6)),
    toInt(tk(t, 12)),
    toInt(tk(t, 13)),
    tk(t, 14) ?? null,
  ]);
  await batchInsert(pool, "escuela.products",
    ["id", "sku", "nombre", "precio_normal", "precio_promocion", "estado",
     "categoria_id", "fecha_registro", "cohorte_moodle_id", "curso_moodle_id",
     "tipo_matricula"], rows);
}

async function importProductSchedules(pool: Pool) {
  // Schema: codigo_producto_escuela, fecha_inicio, fecha_fin, cantidad_modulos,
  // horas_academicas, inicio_examen_final, fin_examen_final, fecha_trabajo_final,
  // fecha_simulacro, fecha_calificaciones, fecha_ranking, fecha_entrega_certificado,
  // fecha_registro, fecha_edicion, codigo_producto, usuario_edicion_id,
  // usuario_registro_id, dias_semana
  const block = findInsertBlock(dump, "tb_producto_escuela");
  if (!block) return;
  const tuples = parseValues(block);
  const rows = tuples
    .map((t) => [
      toBigInt(tk(t, 0)),
      toBigInt(tk(t, 14)),
      toDate(tk(t, 1)),
      toDate(tk(t, 2)),
      tk(t, 3) ?? null,
      tk(t, 4) ?? null,
      tk(t, 17) ?? null,
    ])
    .filter((r) => r[1]);
  await batchInsert(pool, "escuela.product_schedules",
    ["id", "product_id", "fecha_inicio", "fecha_fin", "cantidad_modulos",
     "horas_academicas", "dias_semana"], rows);
}

async function importSales(pool: Pool) {
  // Schema: codigo_venta, folio_venta, medio_venta, origen_venta, monto_total,
  // estado, fecha_venta, fecha_registro, fecha_edicion, codigo_cliente,
  // codigo_moneda, codigo_usuario, ...
  const block = findInsertBlock(dump, "tb_venta");
  if (!block) return;
  const tuples = parseValues(block);
  const rows = tuples.map((t) => [
    toBigInt(tk(t, 0)),
    tk(t, 1) ?? "",
    toBigInt(tk(t, 9)),
    toNumeric(tk(t, 4)),
    toInt(tk(t, 10)),
    toTimestamp(tk(t, 6)),
    toTimestamp(tk(t, 7)),
    toInt(tk(t, 5)),
    tk(t, 2) ?? null,
    tk(t, 3) ?? null,
  ]);
  await batchInsert(pool, "escuela.sales",
    ["id", "folio", "client_id", "monto_total", "moneda_id", "fecha_venta",
     "fecha_registro", "estado", "medio_venta", "origen_venta"], rows);
}

async function importPayments(pool: Pool) {
  // Schema: codigo_pago, monto_pagado, voucher, fecha_pago, observacion, estado,
  // codigo_cuota, codigo_metodo_pago, codigo_moneda, usuario_confirmacion,
  // fecha_confirmacion
  const block = findInsertBlock(dump, "tb_pago");
  if (!block) return;
  const tuples = parseValues(block);
  const rows = tuples.map((t) => [
    toBigInt(tk(t, 0)),
    toNumeric(tk(t, 1)),
    tk(t, 2) ?? null,
    toDate(tk(t, 3)),
    toBigInt(tk(t, 6)),
    toInt(tk(t, 7)),
    toInt(tk(t, 8)),
    toInt(tk(t, 5)),
    toTimestamp(tk(t, 10)),
  ]);
  await batchInsert(pool, "escuela.payments",
    ["id", "monto_pagado", "voucher", "fecha_pago", "cuota_id", "metodo_id",
     "moneda_id", "estado", "fecha_confirmacion"], rows);
}

async function importEnrollments(pool: Pool) {
  // Schema: codigo_matricula, estado, fecha_aprobacion, fecha_matriculado,
  // fecha_edicion, fecha_fin_acceso, motivo_baja, moodle_user_id, intentos,
  // ultimo_error, codigo_cliente, codigo_detalle, codigo_producto,
  // codigo_usuario, fecha_prematricula, beneficiario_confirmado
  const block = findInsertBlock(dump, "tb_matricula");
  if (!block) return;
  const tuples = parseValues(block);
  const rows = tuples.map((t) => [
    toBigInt(tk(t, 0)),
    toBigInt(tk(t, 10)),
    toBigInt(tk(t, 12)),
    toInt(tk(t, 1)),
    toTimestamp(tk(t, 3)),
    toTimestamp(tk(t, 2)),
    toDate(tk(t, 5)),
    tk(t, 6) ?? null,
    toInt(tk(t, 7)),
    toBool(tk(t, 15)),
  ]);
  await batchInsert(pool, "escuela.enrollments",
    ["id", "client_id", "product_id", "estado", "fecha_matriculado",
     "fecha_aprobacion", "fecha_fin_acceso", "motivo_baja", "moodle_user_id",
     "beneficiario_confirmado"], rows);
}

async function importCertificates(pool: Pool) {
  // Shape variable; almacenamos raw JSON para audit posterior.
  const block = findInsertBlock(dump, "tb_certificado_curso");
  if (!block) return;
  const tuples = parseValues(block);
  const rows = tuples.map((t) => [
    toBigInt(tk(t, 0)),
    null,
    null,
    null,
    null,
    JSON.stringify(t),
  ]);
  await batchInsert(pool, "escuela.certificates",
    ["id", "client_id", "product_id", "fecha_emision", "numero_certificado", "raw"], rows);
}

async function importContactLeads(pool: Pool) {
  // Schema: id, external_contact_id, email, last_name, first_name,
  // contact_timezone, whatsapp, is_active, created_at, updated_at
  const block = findInsertBlock(dump, "tb_contact_lead");
  if (!block) return;
  const tuples = parseValues(block);
  const rows = tuples.map((t) => [
    toBigInt(tk(t, 0)),
    toBigInt(tk(t, 1)),
    tk(t, 2) ?? "",
    tk(t, 4) ?? "",
    tk(t, 3) ?? "",
    tk(t, 6) ?? null,
    canonicalizePhone(null, tk(t, 6)),
    toBool(tk(t, 7)),
    toTimestamp(tk(t, 8)),
    toTimestamp(tk(t, 9)),
  ]);
  await batchInsert(pool, "escuela.contact_leads",
    ["id", "external_contact_id", "email", "first_name", "last_name",
     "whatsapp", "canonical_phone", "is_active", "created_at", "updated_at"],
    rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

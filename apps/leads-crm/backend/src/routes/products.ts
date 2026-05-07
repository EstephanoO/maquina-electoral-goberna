import { Router } from "express";
import { sql } from "../sql.js";
import type { AuthedRequest } from "../auth.js";

/**
 * Productos del catálogo Escuela. Cada producto puede tener un classifier_pattern
 * (regex) que se sincroniza automáticamente con una ai_rules row (source='product').
 * Soft-delete: enabled=false, no DELETE row para preservar data histórica de
 * reportes y compras.
 */
export const productsRouter = Router();

productsRouter.get("/products", async (req, res) => {
  const onlyFeatured = req.query.featured === "1" || req.query.featured === "true";
  const rows = onlyFeatured
    ? await sql`
        SELECT p.*, r.name AS rule_name, r.pattern AS rule_pattern, r.tag AS rule_tag, r.enabled AS rule_enabled
          FROM escuela_products p
          LEFT JOIN ai_rules r ON r.id = p.ai_rule_id
         WHERE p.featured = TRUE AND p.enabled = TRUE
         ORDER BY p.fecha_inicio NULLS LAST, p.nombre
      `
    : await sql`
        SELECT p.*, r.name AS rule_name, r.pattern AS rule_pattern, r.tag AS rule_tag, r.enabled AS rule_enabled
          FROM escuela_products p
          LEFT JOIN ai_rules r ON r.id = p.ai_rule_id
         ORDER BY p.featured DESC, p.fecha_inicio NULLS LAST, p.nombre
      `;
  res.json({ products: rows });
});

productsRouter.get("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const rows = await sql`
    SELECT p.*, r.name AS rule_name, r.pattern AS rule_pattern, r.tag AS rule_tag, r.enabled AS rule_enabled
      FROM escuela_products p
      LEFT JOIN ai_rules r ON r.id = p.ai_rule_id
     WHERE p.id = ${id}
     LIMIT 1
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

// POST /products — crea producto + (si trae classifier_pattern) crea ai_rule.
productsRouter.post("/products", async (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  if (typeof b.nombre !== "string" || !b.nombre.trim()) {
    return res.status(400).json({ error: "nombre_required" });
  }

  let aiRuleId: number | null = null;
  if (typeof b.classifier_pattern === "string" && b.classifier_pattern.trim() &&
      typeof b.classifier_tag === "string" && b.classifier_tag.trim()) {
    try { new RegExp(b.classifier_pattern, "i"); }
    catch (e: any) { return res.status(400).json({ error: "invalid_regex", message: e.message }); }
    const ruleRows = await sql`
      INSERT INTO ai_rules (name, pattern, tag, weight, enabled, source)
      VALUES (${`product:${b.nombre}`}, ${b.classifier_pattern}, ${b.classifier_tag}, ${b.weight ?? 1.0}, TRUE, 'product')
      RETURNING id
    `;
    aiRuleId = ruleRows[0]?.id ?? null;
  }

  const rows = await sql`
    INSERT INTO escuela_products (
      sku, nombre, descripcion, imagen_url, precio_soles, precio_dolares,
      fecha_inicio, fecha_fin, dias_semana, horario, horas_academicas, modalidad,
      link_matricula, cuenta_bancaria, yape_numero,
      classifier_pattern, classifier_tag, ai_rule_id,
      featured, enabled, created_by, updated_by
    ) VALUES (
      ${b.sku ?? null}, ${b.nombre}, ${b.descripcion ?? ''}, ${b.imagen_url ?? null},
      ${b.precio_soles ?? null}, ${b.precio_dolares ?? null},
      ${b.fecha_inicio ?? null}, ${b.fecha_fin ?? null},
      ${b.dias_semana ?? null}, ${b.horario ?? null}, ${b.horas_academicas ?? null},
      ${b.modalidad ?? 'zoom'},
      ${b.link_matricula ?? null}, ${b.cuenta_bancaria ?? null}, ${b.yape_numero ?? null},
      ${b.classifier_pattern ?? null}, ${b.classifier_tag ?? null}, ${aiRuleId},
      ${b.featured ?? false}, ${b.enabled ?? true},
      ${(req as any).userEmail ?? 'unknown'}, ${(req as any).userEmail ?? 'unknown'}
    )
    RETURNING *
  `;
  res.json(rows[0]);
});

// PUT /products/:id — actualiza + sincroniza ai_rule asociada.
productsRouter.put("/products/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const b = req.body ?? {};

  const cur = await sql`SELECT ai_rule_id FROM escuela_products WHERE id = ${id} LIMIT 1`;
  if (cur.length === 0) return res.status(404).json({ error: "not_found" });
  let aiRuleId: number | null = cur[0].ai_rule_id;

  if (typeof b.classifier_pattern === "string" && b.classifier_pattern.trim()) {
    try { new RegExp(b.classifier_pattern, "i"); }
    catch (e: any) { return res.status(400).json({ error: "invalid_regex", message: e.message }); }
  }

  // Sync ai_rule: si no existe y traemos pattern, creamos. Si existe, actualizamos.
  if (b.classifier_pattern && b.classifier_tag) {
    if (aiRuleId == null) {
      const ruleRows = await sql`
        INSERT INTO ai_rules (name, pattern, tag, weight, enabled, source)
        VALUES (${`product:${b.nombre ?? 'sin-nombre'}`}, ${b.classifier_pattern}, ${b.classifier_tag}, ${b.weight ?? 1.0}, TRUE, 'product')
        RETURNING id
      `;
      aiRuleId = ruleRows[0]?.id ?? null;
    } else {
      await sql`
        UPDATE ai_rules
           SET name = ${`product:${b.nombre ?? 'sin-nombre'}`},
               pattern = ${b.classifier_pattern},
               tag = ${b.classifier_tag},
               weight = ${b.weight ?? 1.0},
               updated_at = now()
         WHERE id = ${aiRuleId}
      `;
    }
  } else if (b.classifier_pattern === null && aiRuleId != null) {
    // Si limpian explicit el pattern, deshabilita la rule asociada.
    await sql`UPDATE ai_rules SET enabled = FALSE, updated_at = now() WHERE id = ${aiRuleId}`;
  }

  const rows = await sql`
    UPDATE escuela_products SET
      sku              = COALESCE(${b.sku ?? null}, sku),
      nombre           = COALESCE(${b.nombre ?? null}, nombre),
      descripcion      = COALESCE(${b.descripcion ?? null}, descripcion),
      imagen_url       = COALESCE(${b.imagen_url ?? null}, imagen_url),
      precio_soles     = COALESCE(${b.precio_soles ?? null}, precio_soles),
      precio_dolares   = COALESCE(${b.precio_dolares ?? null}, precio_dolares),
      fecha_inicio     = COALESCE(${b.fecha_inicio ?? null}::date, fecha_inicio),
      fecha_fin        = COALESCE(${b.fecha_fin ?? null}::date, fecha_fin),
      dias_semana      = COALESCE(${b.dias_semana ?? null}, dias_semana),
      horario          = COALESCE(${b.horario ?? null}, horario),
      horas_academicas = COALESCE(${b.horas_academicas ?? null}, horas_academicas),
      modalidad        = COALESCE(${b.modalidad ?? null}, modalidad),
      link_matricula   = COALESCE(${b.link_matricula ?? null}, link_matricula),
      cuenta_bancaria  = COALESCE(${b.cuenta_bancaria ?? null}, cuenta_bancaria),
      yape_numero      = COALESCE(${b.yape_numero ?? null}, yape_numero),
      classifier_pattern = ${b.classifier_pattern ?? null},
      classifier_tag     = ${b.classifier_tag ?? null},
      ai_rule_id       = ${aiRuleId},
      featured         = COALESCE(${b.featured ?? null}, featured),
      enabled          = COALESCE(${b.enabled ?? null}, enabled),
      updated_by       = ${(req as any).userEmail ?? 'unknown'},
      updated_at       = now()
    WHERE id = ${id}
    RETURNING *
  `;
  res.json(rows[0]);
});

productsRouter.delete("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  // Soft delete: enabled=false. Conservamos data para reportes.
  const rows = await sql`
    UPDATE escuela_products SET enabled = FALSE, featured = FALSE, updated_at = now()
    WHERE id = ${id}
    RETURNING id
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true, id: rows[0].id });
});

import { Router } from "express";
import { sql } from "../sql.js";

/**
 * Escalations: bot pide ayuda al operador en intents sensibles
 * (credentials/sensitive_personal_data). El backend solo registra el evento
 * (audit log). El bot se encarga del envío del WA al escalation_phone usando
 * su propia conexión Baileys — pasa por acá solo para que quede trazado quién
 * pidió, qué pidió y a quién avisamos.
 */
export const escalationsRouter = Router();

escalationsRouter.post("/escalations", async (req, res) => {
  const b = req.body ?? {};
  // lead_id es opcional (puede no haber lead todavía si el escalation viene
  // de un mensaje sin matching). bot_instance_id sí es required para auditoría.
  if (!b.bot_instance_id || !b.reason || !b.inbound_body || !b.notified_phone) {
    return res.status(400).json({
      error: "missing_fields",
      required: ["bot_instance_id", "reason", "inbound_body", "notified_phone"],
    });
  }
  const rows = await sql`
    INSERT INTO escalations (lead_id, bot_instance_id, reason, inbound_body, notified_phone, notify_status, notify_error)
    VALUES (${b.lead_id}, ${b.bot_instance_id}, ${b.reason}, ${b.inbound_body}, ${b.notified_phone},
            ${b.notify_status ?? 'pending'}, ${b.notify_error ?? null})
    RETURNING *
  `;
  res.json(rows[0]);
});

// El bot llama esto después del intento de envío para cerrar el ciclo.
escalationsRouter.patch("/escalations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const b = req.body ?? {};
  const rows = await sql`
    UPDATE escalations SET
      notify_status = COALESCE(${b.notify_status ?? null}, notify_status),
      notify_error  = ${b.notify_error ?? null},
      resolved_at   = ${b.resolved ? sql`now()` : sql`resolved_at`},
      resolved_by   = ${b.resolved_by ?? null}
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

// Listado: filtrable por bot_instance_id (operador solo ve las suyas) +
// status (pending/resolved).
escalationsRouter.get("/escalations", async (req, res) => {
  const { bot_instance_id, status } = req.query as any;
  const rows = await sql`
    SELECT e.*, l.name AS lead_name, l.phone AS lead_phone, b.slug AS instance_slug
    FROM escalations e
    LEFT JOIN leads l ON l.id = e.lead_id
    LEFT JOIN bot_instances b ON b.id = e.bot_instance_id
    WHERE (${bot_instance_id ?? null}::int IS NULL OR e.bot_instance_id = ${bot_instance_id ?? null}::int)
      AND (${status === 'pending' ? sql`e.resolved_at IS NULL` : status === 'resolved' ? sql`e.resolved_at IS NOT NULL` : sql`TRUE`})
    ORDER BY e.created_at DESC LIMIT 100
  `;
  res.json({ escalations: rows });
});

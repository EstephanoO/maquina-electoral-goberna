import { Router } from "express";
import { sql } from "../sql.js";

/**
 * Agenda: appointments + slots (recurring weekly schedule por operator).
 * /appointment-slots/available calcula próximos N huecos disponibles
 * combinando recurring slots + ya tomados + now() en delante.
 */
export const appointmentsRouter = Router();

// Próximos N slots disponibles para un operador
appointmentsRouter.get("/appointment-slots/available", async (req, res) => {
  const operatorId = Number(req.query.operator_id) || 4;
  const limit = Math.min(Number(req.query.limit) || 3, 10);
  const daysAhead = Math.min(Number(req.query.days_ahead) || 14, 30);

  const now = new Date();
  const nowLima = new Date(now.getTime() - 5 * 3600 * 1000);

  const slotRows = await sql`
    SELECT weekday, start_hr, start_min, end_hr, end_min, duration_min
      FROM appointment_slots
     WHERE operator_id = ${operatorId} AND enabled = TRUE
     ORDER BY weekday, start_hr, start_min
  `;
  const taken = await sql`
    SELECT scheduled_at FROM appointments
     WHERE operator_id = ${operatorId}
       AND status IN ('pending', 'confirmed')
       AND scheduled_at > now()
       AND scheduled_at < now() + (${daysAhead} || ' days')::interval
  `;
  const takenISO = new Set(taken.map((t: any) => new Date(t.scheduled_at).toISOString()));

  const out: Array<{ iso: string; weekday: number; hour: number; minute: number; display: string }> = [];

  outer: for (let d = 0; d < daysAhead; d++) {
    const day = new Date(nowLima);
    day.setDate(day.getDate() + d);
    const wd = day.getDay();

    const daySlots = slotRows.filter((s: any) => s.weekday === wd);
    for (const s of daySlots) {
      const stepMin = s.duration_min || 30;
      const startTotalMin = s.start_hr * 60 + (s.start_min || 0);
      const endTotalMin = s.end_hr * 60 + (s.end_min || 0);

      for (let m = startTotalMin; m + stepMin <= endTotalMin; m += stepMin) {
        const hr = Math.floor(m / 60);
        const min = m % 60;
        const slotDt = new Date(Date.UTC(
          day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(),
          hr + 5, min, 0,
        ));
        if (slotDt <= now) continue;
        const iso = slotDt.toISOString();
        if (takenISO.has(iso)) continue;

        const limaDt = new Date(slotDt.getTime() - 5 * 3600 * 1000);
        const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
        const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
        const ampm = hr >= 12 ? "p.m." : "a.m.";
        const h12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
        const display = `${days[limaDt.getUTCDay()]} ${limaDt.getUTCDate()} ${months[limaDt.getUTCMonth()]} · ${h12}:${String(min).padStart(2,'0')} ${ampm}`;

        out.push({ iso, weekday: wd, hour: hr, minute: min, display });
        if (out.length >= limit) break outer;
      }
    }
  }

  res.json({ slots: out });
});

// ── Appointments CRUD ────────────────────────────────────────────────
appointmentsRouter.get("/appointments", async (_req, res) => {
  const rows = await sql`SELECT * FROM v_upcoming_appointments LIMIT 100`;
  res.json({ items: rows });
});

appointmentsRouter.post("/appointments", async (req, res) => {
  const b = req.body ?? {};
  if (!b.scheduled_at) return res.status(400).json({ error: "scheduled_at_required" });
  const rows = await sql`
    INSERT INTO appointments (
      lead_id, operator_id, bot_instance_id,
      scheduled_at, duration_min, meeting_url, meeting_kind,
      status, notes, created_via
    ) VALUES (
      ${b.lead_id ?? null}, ${b.operator_id ?? 4}, ${b.bot_instance_id ?? null},
      ${b.scheduled_at}, ${b.duration_min ?? 30},
      ${b.meeting_url ?? null}, ${b.meeting_kind ?? 'zoom'},
      ${b.status ?? 'confirmed'}, ${b.notes ?? null}, ${b.created_via ?? 'api'}
    )
    RETURNING *
  `;
  res.json(rows[0]);
});

appointmentsRouter.put("/appointments/:id", async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const rows = await sql`
    UPDATE appointments SET
      scheduled_at = COALESCE(${b.scheduled_at ?? null}, scheduled_at),
      duration_min = COALESCE(${b.duration_min ?? null}, duration_min),
      meeting_url = ${b.meeting_url ?? null},
      meeting_kind = COALESCE(${b.meeting_kind ?? null}, meeting_kind),
      status = COALESCE(${b.status ?? null}, status),
      notes = ${b.notes ?? null},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

appointmentsRouter.delete("/appointments/:id", async (req, res) => {
  const id = Number(req.params.id);
  await sql`UPDATE appointments SET status = 'cancelled', updated_at = now() WHERE id = ${id}`;
  res.json({ ok: true });
});

// ── Slots CRUD (operator availability) ───────────────────────────────
appointmentsRouter.get("/appointment-slots", async (req, res) => {
  const operatorId = Number(req.query.operator_id) || null;
  const rows = operatorId
    ? await sql`SELECT * FROM appointment_slots WHERE operator_id = ${operatorId} ORDER BY weekday, start_hr`
    : await sql`SELECT * FROM appointment_slots ORDER BY operator_id, weekday, start_hr`;
  res.json({ slots: rows });
});

appointmentsRouter.post("/appointment-slots", async (req, res) => {
  const b = req.body ?? {};
  const rows = await sql`
    INSERT INTO appointment_slots (operator_id, weekday, start_hr, start_min, end_hr, end_min, duration_min)
    VALUES (${b.operator_id}, ${b.weekday}, ${b.start_hr}, ${b.start_min ?? 0},
            ${b.end_hr}, ${b.end_min ?? 0}, ${b.duration_min ?? 30})
    ON CONFLICT (operator_id, weekday, start_hr, start_min) DO UPDATE SET
      end_hr = EXCLUDED.end_hr, end_min = EXCLUDED.end_min,
      duration_min = EXCLUDED.duration_min, enabled = TRUE
    RETURNING *
  `;
  res.json(rows[0]);
});

appointmentsRouter.delete("/appointment-slots/:id", async (req, res) => {
  const id = Number(req.params.id);
  await sql`DELETE FROM appointment_slots WHERE id = ${id}`;
  res.json({ ok: true });
});

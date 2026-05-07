import { Router } from "express";
import { sql } from "../sql.js";
import { db } from "../db.js";
import { getCourses } from "../courses.js";
import type { AuthedRequest } from "../auth.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  try {
    await sql`SELECT 1`;
    res.json({ ok: true, service: "nexus-backend", version: "0.2.0", db: "ok" });
  } catch (e: any) {
    res.status(503).json({ ok: false, db: "down", error: e?.message });
  }
});

// Heartbeat — extension manda ping cada 30s para registrar qué número WA está
// online. Podado de >24h para no acumular zombies.
healthRouter.post("/heartbeat", async (req: AuthedRequest, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) return res.status(400).json({ error: "phone_required" });
  const sessions = (await db.getSetting<Record<string, any>>("active_sessions")) || {};
  sessions[phone] = {
    last_seen: new Date().toISOString(),
    user_id: req.user?.id,
    user_name: req.user?.name,
    user_email: req.user?.email,
  };
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [k, v] of Object.entries(sessions)) {
    if (new Date(v.last_seen).getTime() < cutoff) delete sessions[k];
  }
  await db.setSetting("active_sessions", sessions);
  res.json({ ok: true });
});

healthRouter.get("/courses", async (req, res) => {
  try {
    const courses = await getCourses(req.query.refresh === "1");
    res.json(courses);
  } catch (e: any) {
    res.status(502).json({ error: "moodle_fetch_failed", message: e?.message });
  }
});

import express from "express";
import cors from "cors";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { db, classifyMessage, invalidatePrefixCache, type LeadInput, type SendStatus } from "./db.js";
import { DEFAULT_COUNTRY_PREFIXES } from "./lib/country.js";
import { migrate } from "./migrate.js";
import { sql } from "./sql.js";
import { renderTemplate, previewVariants } from "./lib/template.js";
import { getCourses } from "./courses.js";
import {
  comparePassword, createUser, findUserByEmail, requireAuth, signToken,
  type AuthedRequest,
} from "./auth.js";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

// Safe async handler — catches unhandled promise rejections
type AsyncHandler = (req: express.Request, res: express.Response) => Promise<any>;
function safe(fn: AsyncHandler): AsyncHandler {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e: any) {
      console.error(`[api] ${req.method} ${req.path} error:`, e.message);
      if (!res.headersSent) res.status(500).json({ error: e.message || "server_error" });
    }
  };
}
// CORS: accept the configured origin (web CRM) + any chrome-extension://.
// We use JWT in Authorization header, no cookies → credentials not needed.
const CORS_ORIGIN = process.env.CORS_ORIGIN;
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);                  // same-origin / curl
    if (origin.startsWith("chrome-extension://")) return cb(null, true);
    if (origin.startsWith("moz-extension://")) return cb(null, true);
    if (!CORS_ORIGIN || CORS_ORIGIN === "*") return cb(null, true);
    if (origin === CORS_ORIGIN) return cb(null, true);
    cb(new Error(`origin not allowed: ${origin}`));
  },
  credentials: false,
}));
app.use(express.json({ limit: "2mb" }));

// ---------- Uploads (template images) ----------
const UPLOADS_DIR = process.env.UPLOADS_DIR || "/app/uploads";
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext = (extname(file.originalname) || ".jpg").toLowerCase();
      cb(null, `${Date.now()}_${randomUUID().slice(0, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\//.test(file.mimetype));
  },
});

// Serve uploaded files publicly (no auth) — they're just images.
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "7d" }));

// Chrome Private Network Access
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Access-Control-Request-Private-Network");
    return res.status(204).end();
  }
  next();
});

// -------- PUBLIC --------
app.get("/health", async (_req, res) => {
  try {
    await sql`SELECT 1`;
    res.json({ ok: true, service: "nexus-backend", version: "0.2.0", db: "ok" });
  } catch (e: any) {
    res.status(503).json({ ok: false, db: "down", error: e?.message });
  }
});

// -------- AUTH --------
app.post("/auth/register", async (req, res) => {
  const { email, password, name, phone } = req.body ?? {};
  if (!email || !password || !name) return res.status(400).json({ error: "email_password_name_required" });
  if (String(password).length < 6) return res.status(400).json({ error: "password_too_short" });
  const existing = await findUserByEmail(email);
  if (existing) return res.status(409).json({ error: "email_already_registered" });
  const user = await createUser({ email, password, name, phone });
  const token = signToken(user.id);
  res.status(201).json({ token, user });
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "email_password_required" });
  const u = await findUserByEmail(email);
  if (!u || u.disabled) return res.status(401).json({ error: "invalid_credentials" });
  const ok = await comparePassword(password, u.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });
  const { password_hash, ...user } = u;
  res.json({ token: signToken(u.id), user });
});

app.get("/auth/me", requireAuth, (req: AuthedRequest, res) => {
  res.json(req.user);
});

// -------- PROTECTED (everything below, except bot-facing routes) --------
const BOT_OPEN_ROUTES = ["/messages", "/leads/by-phone/", "/leads/count", "/chats", "/bot/"];
app.use((req, res, next) => {
  // Allow bot/internal routes without auth.
  if (BOT_OPEN_ROUTES.some((r) => req.path.startsWith(r))) return next();
  // /ai/rules GET es pulled por el bot desde dentro del docker network
  // (clasificador en runtime) sin auth — los demás verbos requieren auth
  // porque solo UI/admin debería editar reglas.
  if (req.method === "GET" && req.path === "/ai/rules") return next();
  // Bot reads instance config + templates to drive auto-reply (DB-driven). GET only.
  if (req.method === "GET" && (req.path === "/config/instances" || req.path === "/templates" || req.path === "/campaigns/queue")) return next();
  if (req.method === "POST" && /^\/campaigns\/recipient\/[0-9]+\/(sent|failed)$/.test(req.path)) return next();
  // Bot signals attention queue
  if (req.method === "POST" && /^\/\leads\/[0-9]+\/flag-attention$/.test(req.path)) return next();
  return requireAuth(req, res, next);
});

// Heartbeat: extension pings every 30s to record which WA number is online.
app.post("/heartbeat", async (req: AuthedRequest, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) return res.status(400).json({ error: "phone_required" });
  const sessions = (await db.getSetting<Record<string, any>>("active_sessions")) || {};
  sessions[phone] = {
    last_seen: new Date().toISOString(),
    user_id: req.user?.id,
    user_name: req.user?.name,
    user_email: req.user?.email,
  };
  // Prune entries older than 24h
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [k, v] of Object.entries(sessions)) {
    if (new Date(v.last_seen).getTime() < cutoff) delete sessions[k];
  }
  await db.setSetting("active_sessions", sessions);
  res.json({ ok: true });
});

// Courses (from Moodle, cached 10min)
app.get("/courses", async (req, res) => {
  try {
    const courses = await getCourses(req.query.refresh === "1");
    res.json(courses);
  } catch (e: any) {
    res.status(502).json({ error: "moodle_fetch_failed", message: e?.message });
  }
});

// LEADS
app.get("/leads/count", safe(async (req, res) => {
  const { q, stage, buyer_tier, country, year } = req.query as any;
  res.json(await db.count({ q, stage, buyer_tier, country, year }));
}));

app.get("/leads", safe(async (req, res) => {
  const { q, stage, course, interest, level, year, tag, assigned_to, priority, follow_up_due, buyer_tier, country, limit, offset } = req.query as any;
  res.json(await db.list({
    q, stage, course, interest, level, year, tag, assigned_to, priority, buyer_tier, country,
    follow_up_due: follow_up_due === "true" || follow_up_due === "1",
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  }));
}));

app.get("/leads/by-phone/:phone", async (req, res) => {
  const lead = await db.findByPhone(req.params.phone);
  if (!lead) return res.status(404).json({ error: "not_found" });
  res.json(lead);
});

app.get("/leads/:id", async (req, res) => {
  const lead = await db.get(Number(req.params.id));
  if (!lead) return res.status(404).json({ error: "not_found" });
  res.json(lead);
});

app.post("/leads", async (req, res) => {
  const body = req.body as LeadInput;
  if (!body?.name && !body?.phone) return res.status(400).json({ error: "name_or_phone_required" });
  if (body.phone) {
    const existing = await db.findByPhone(body.phone);
    if (existing) {
      const updated = await db.update(existing.id, body);
      if (body.last_activity_at && !existing.last_contacted_at) {
        await db.backfillActivity(existing.id, body.last_activity_at, body.assigned_to ?? existing.assigned_to ?? null);
      }
      return res.json(updated);
    }
  }
  try {
    const lead = await db.create({ ...body, name: body.name || body.phone! });
    res.status(201).json(lead);
  } catch (e: any) {
    if (e?.code === "23505" && body.phone) {
      try {
        const digits = body.phone.replace(/\D/g, "");
        const rows = await (await import("./sql.js")).sql`SELECT id FROM leads WHERE regexp_replace(phone, '\\D', '', 'g') = ${digits} LIMIT 1`;
        if (rows[0]) return res.json(await db.update(rows[0].id, body));
      } catch {}
    }
    res.status(409).json({ error: "duplicate_phone" });
  }
});

app.patch("/leads/:id", async (req, res) => {
  const updated = await db.update(Number(req.params.id), req.body as LeadInput);
  if (!updated) return res.status(404).json({ error: "not_found" });
  res.json(updated);
});

app.delete("/leads/:id", async (req, res) => {
  const ok = await db.remove(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "not_found" });
  res.status(204).end();
});

// Bulk actions
app.post("/leads/bulk", async (req, res) => {
  try {
    const { ids, patch } = req.body as { ids: number[]; patch: LeadInput };
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids_required" });
    const results = [];
    for (const id of ids) {
      try {
        const r = await db.update(id, patch);
        if (r) results.push(r);
      } catch (e: any) {
        console.warn(`[bulk] Failed to update lead ${id}:`, e.message);
      }
    }
    res.json({ updated: results.length, leads: results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// INTERACTIONS
app.get("/leads/:id/interactions", async (req, res) => {
  res.json(await db.listInteractions(Number(req.params.id)));
});
app.post("/leads/:id/interactions", async (req, res) => {
  const it = await db.addInteraction(Number(req.params.id), req.body);
  if (!it) return res.status(404).json({ error: "lead_not_found" });
  res.status(201).json(it);
});
app.post("/messages", safe(async (req, res) => {
  const r = await db.recordMessage(req.body);
  if (!r) return res.status(400).json({ error: "invalid_phone" });
  res.status(201).json(r);
}));

// Bulk interactions for a single lead (used by WA history sync).
app.post("/leads/:id/interactions/bulk", async (req, res) => {
  const leadId = Number(req.params.id);
  const { items } = req.body as { items?: Array<any> };
  if (!Array.isArray(items)) return res.status(400).json({ error: "items_required" });
  const result = await db.addInteractionsBulk(leadId, items);
  res.status(201).json(result);
});

// TEMPLATES
app.get("/templates", async (_req, res) => res.json(await db.listTemplates()));
app.get("/templates/:id", async (req, res) => {
  const t = await db.getTemplate(Number(req.params.id));
  if (!t) return res.status(404).json({ error: "not_found" });
  res.json(t);
});
app.post("/templates", async (req, res) => {
  const { name, body, image_url } = req.body ?? {};
  if (!name || !body) return res.status(400).json({ error: "name_and_body_required" });
  res.status(201).json(await db.createTemplate({ name, body, image_url }));
});
app.patch("/templates/:id", async (req, res) => {
  const t = await db.updateTemplate(Number(req.params.id), req.body);
  if (!t) return res.status(404).json({ error: "not_found" });
  res.json(t);
});
app.delete("/templates/:id", async (req, res) => {
  const ok = await db.removeTemplate(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "not_found" });
  res.status(204).end();
});

// Upload an image for templates. Returns { url: "/uploads/..." }
app.post("/templates/upload", upload.single("image"), (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: "no_file" });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Template preview (3 variants)
app.post("/templates/preview", (req, res) => {
  const { body, sample } = req.body ?? {};
  if (!body) return res.status(400).json({ error: "body_required" });
  res.json(previewVariants(body, sample ?? {
    nombre: "María", nombre_completo: "María González",
    curso: "Oratoria", nivel: "medio", telefono: "+51999888777",
    asignado: "Carolina",
  }));
});

// SEND QUEUE
app.get("/sends", async (req, res) => {
  const { status, assigned_to, available_now } = req.query as Record<string, string | undefined>;
  res.json(await db.listSends({
    status: status as SendStatus | undefined,
    assigned_to,
    availableNow: available_now === "1" || available_now === "true",
  }));
});

app.post("/sends", async (req, res) => {
  const { lead_ids, body, assigned_to, image_url, scheduled_at } = req.body as {
    lead_ids?: number[]; body?: string; assigned_to?: string;
    image_url?: string | null; scheduled_at?: string | null;
  };
  if (!Array.isArray(lead_ids) || lead_ids.length === 0) return res.status(400).json({ error: "lead_ids_required" });
  if (!body?.trim() && !image_url) return res.status(400).json({ error: "body_or_image_required" });

  // Validate scheduled_at if provided
  let schedISO: string | null = null;
  if (scheduled_at) {
    const t = new Date(scheduled_at);
    if (isNaN(t.getTime())) return res.status(400).json({ error: "scheduled_at_invalid" });
    schedISO = t.toISOString();
  }

  const rows: { lead_id: number; body: string; body_parts: string[]; image_url?: string | null }[] = [];
  for (const id of lead_ids) {
    const lead = await db.get(id);
    if (!lead) continue;
    const first = (lead.name || "").split(/\s+/)[0] || "";
    const ctx = {
      nombre: first,
      nombre_completo: lead.name ?? "",
      telefono: lead.phone ?? "",
      curso: lead.course ?? ((lead.interests || [])[0] ?? ""),
      intereses: (lead.interests || []).join(", "),
      nivel: lead.level ?? "",
      asignado: lead.assigned_to ?? "",
    };
    const parts = body?.trim() ? renderTemplate(body, ctx, `lead-${id}`) : [""];
    rows.push({
      lead_id: id,
      body: parts.join("\n---\n"),
      body_parts: parts,
      image_url: image_url ?? null,
    });
  }
  const sends = await db.createSendsMulti({ rows, assigned_to, scheduled_at: schedISO });
  res.status(201).json(sends);
});

// OPERATORS (used by web to assign sends)
app.get("/users", requireAuth, async (_req, res) => {
  res.json(await db.listOperators());
});

app.patch("/sends/:id", async (req, res) => {
  const updated = await db.updateSend(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: "not_found" });
  res.json(updated);
});

app.delete("/sends/:id", async (req, res) => {
  const ok = await db.cancelSend(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "not_found" });
  res.status(204).end();
});

// STATS
app.get("/stats", async (_req, res) => res.json(await db.stats()));

// SETTINGS (anti-ban, etc.)
app.get("/settings/:key", async (req, res) => {
  let v = await db.getSetting(req.params.key);
  // Seed default for country_prefixes so the web UI always has something to render
  if (v == null && req.params.key === "country_prefixes") {
    v = DEFAULT_COUNTRY_PREFIXES;
    await db.setSetting("country_prefixes", v);
  }
  if (v == null && req.params.key === "sender_phones") {
    v = [];
    await db.setSetting("sender_phones", v);
  }
  if (v == null) return res.status(404).json({ error: "not_found" });
  res.json(v);
});
app.put("/settings/:key", async (req: AuthedRequest, res) => {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "admin_only" });
  await db.setSetting(String(req.params.key), req.body);
  if (req.params.key === "country_prefixes") invalidatePrefixCache();
  res.json({ ok: true });
});

// ==================== CHAT ENDPOINTS ====================

// List all chats (grouped by lead, sorted by last message)
app.get("/chats", async (req, res) => {
  const { assigned_to, q, limit: lim } = req.query as any;
  const limitN = Math.min(Number(lim) || 50, 200);

  const rows = await sql`
    WITH last_msg AS (
      SELECT DISTINCT ON (lead_id)
        lead_id,
        id as last_interaction_id,
        kind,
        body,
        created_at,
        by_user
      FROM interactions
      WHERE kind IN ('message_in', 'message_out')
      ORDER BY lead_id, created_at DESC
    ),
    unread AS (
      -- Cuenta inbounds posteriores al MAYOR de:
      --  (a) el último message_out (el operador contestó), o
      --  (b) leads.last_read_at (el operador abrió el chat sin contestar).
      -- Antes solo (a). Por eso abrir un chat sin responder no bajaba el
      -- badge — fix de mark-as-read agregado 2026-05-06.
      SELECT lead_id, count(*)::int as unread_count
      FROM interactions
      WHERE kind = 'message_in'
        AND created_at > GREATEST(
          COALESCE(
            (SELECT max(created_at) FROM interactions i2
             WHERE i2.lead_id = interactions.lead_id AND i2.kind = 'message_out'),
            '1970-01-01'::timestamptz
          ),
          COALESCE(
            (SELECT last_read_at FROM leads l WHERE l.id = interactions.lead_id),
            '1970-01-01'::timestamptz
          )
        )
      GROUP BY lead_id
    )
    SELECT
      l.id, l.name, l.phone, l.country, l.stage, l.buyer_tier,
      l.total_usd_spent, l.n_purchases, l.assigned_to,
      l.interests, l.tags, l.course,
      lm.body as last_message,
      lm.kind as last_message_kind,
      lm.created_at as last_message_at,
      COALESCE(u.unread_count, 0) as unread_count
    FROM leads l
    JOIN last_msg lm ON lm.lead_id = l.id
    LEFT JOIN unread u ON u.lead_id = l.id
    WHERE
      (${assigned_to ?? null}::text IS NULL OR l.assigned_to = ${assigned_to ?? null})
      AND (${(q as string) ?? null}::text IS NULL OR
           lower(l.name) LIKE '%' || ${((q as string) ?? "").toLowerCase()} || '%' OR
           lower(coalesce(l.phone, '')) LIKE '%' || ${((q as string) ?? "").toLowerCase()} || '%')
    ORDER BY lm.created_at DESC
    LIMIT ${limitN}
  `;

  res.json(rows.map((r: any) => ({
    lead_id: r.id,
    name: r.name,
    phone: r.phone,
    country: r.country,
    stage: r.stage,
    buyer_tier: r.buyer_tier,
    total_usd_spent: Number(r.total_usd_spent) || 0,
    n_purchases: r.n_purchases || 0,
    assigned_to: r.assigned_to,
    interests: r.interests || [],
    tags: r.tags || [],
    course: r.course,
    last_message: r.last_message,
    last_message_kind: r.last_message_kind,
    last_message_at: r.last_message_at,
    unread_count: r.unread_count,
  })));
});

// Get full lead detail for CRM panel (lead + purchases + activity)
app.get("/chats/:leadId/detail", async (req, res) => {
  const leadId = Number(req.params.leadId);
  const lead = await db.get(leadId);
  if (!lead) return res.status(404).json({ error: "not found" });

  // Purchases
  const purchases = await sql`
    SELECT id, body, meta, created_at FROM interactions
    WHERE lead_id = ${leadId} AND kind = 'purchase'
    ORDER BY created_at DESC
  `;

  // Recent activity (last 20 non-message interactions + last 5 messages)
  const activity = await sql`
    SELECT id, kind, body, meta, by_user, created_at FROM interactions
    WHERE lead_id = ${leadId}
    ORDER BY created_at DESC LIMIT 20
  `;

  res.json({
    lead,
    purchases: purchases.map((p: any) => ({
      id: p.id,
      product: p.meta?.product || "Producto",
      amount_usd: Number(p.meta?.amount_usd) || 0,
      method: p.meta?.method || null,
      date: p.created_at,
    })),
    activity: activity.map((a: any) => ({
      id: a.id,
      kind: a.kind,
      body: a.body,
      by: a.by_user,
      meta: a.meta,
      time: a.created_at,
    })),
  });
});

// Get messages for a specific lead (chat thread)
app.get("/chats/:leadId/messages", async (req, res) => {
  const leadId = Number(req.params.leadId);
  const { before, limit: lim } = req.query as any;
  const limitN = Math.min(Number(lim) || 50, 200);

  const rows = await sql`
    SELECT id, lead_id, kind, body, meta, by_user, created_at, external_id
    FROM interactions
    WHERE lead_id = ${leadId}
      AND kind IN ('message_in', 'message_out')
      AND (${before ?? null}::timestamptz IS NULL OR created_at < ${before ?? null})
    ORDER BY created_at DESC
    LIMIT ${limitN}
  `;

  // Return oldest first for chat display
  res.json(rows.reverse().map((r: any) => ({
    id: r.id,
    kind: r.kind,
    body: r.body,
    by: r.by_user,
    time: r.created_at,
    meta: r.meta,
  })));
});

// Send a message via the bot
app.post("/chats/:leadId/send", async (req, res) => {
  const leadId = Number(req.params.leadId);
  const { message, via } = req.body; // via = "peru1" | "peru2"
  if (!message) return res.status(400).json({ error: "message required" });

  const lead = await db.get(leadId);
  if (!lead) return res.status(404).json({ error: "lead not found" });
  if (!lead.phone) return res.status(400).json({ error: "lead has no phone" });

  const botUrl = process.env.BOT_URL || "http://bot:4020";

  // Auto-detect which bot instance to use:
  // 1. Explicit `via` parameter
  // 2. Match by lead's assigned_to phone
  // 3. Find first ready instance
  let instanceId = via || "";
  if (!instanceId && lead.assigned_to) {
    // Map assigned phone to instance ID. Mantenemos los aliases legacy
    // (peru1/peru2/peru3) para compat. Cualquier número nuevo se resuelve
    // dinámicamente vía /bot/status fallback más abajo.
    if (lead.assigned_to.includes("986855496")) instanceId = "peru1";
    else if (lead.assigned_to.includes("986394450")) instanceId = "peru2";
    else if (lead.assigned_to.includes("954562435")) instanceId = "peru3";
    else if (lead.assigned_to.includes("944531711")) instanceId = "peru4";
  }
  if (!instanceId) {
    // Find first ready instance
    try {
      const statusRes = await fetch(`${botUrl}/status`);
      const statuses = await statusRes.json() as any[];
      const ready = statuses.find((s: any) => s.status === "ready");
      if (ready) instanceId = ready.id;
    } catch {}
  }
  if (!instanceId) instanceId = "peru1"; // fallback

  try {
    // Send via bot
    const botRes = await fetch(`${botUrl}/send/${instanceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: lead.phone, message }),
    });
    if (!botRes.ok) {
      const err = await botRes.text();
      return res.status(502).json({ error: `bot: ${instanceId} — ${err}` });
    }

    // Record interaction
    const interaction = await db.addInteraction(leadId, {
      kind: "message_out",
      body: message,
      by: (req as any).user?.email || instanceId,
    });

    res.json({ ok: true, interaction });
  } catch (e: any) {
    res.status(502).json({ error: `bot unreachable: ${e.message}` });
  }
});

// Mark a chat as read — sets leads.last_read_at = now() para que
// el unread_count del /chats query baje el badge sin necesidad de que el
// operador conteste. Lo llama el frontend en chat select.
app.post("/chats/:leadId/read", async (req, res) => {
  const leadId = Number(req.params.leadId);
  if (!Number.isFinite(leadId)) return res.status(400).json({ error: "invalid_id" });
  const rows = await sql`
    UPDATE leads SET last_read_at = now()
    WHERE id = ${leadId}
    RETURNING id, last_read_at
  `;
  if (!rows[0]) return res.status(404).json({ error: "lead_not_found" });
  res.json({ ok: true, lead_id: rows[0].id, last_read_at: rows[0].last_read_at });
});

// Bot status proxy
app.get("/bot/status", async (_req, res) => {
  const botUrl = process.env.BOT_URL || "http://bot:4020";
  try {
    const r = await fetch(`${botUrl}/status`);
    res.json(await r.json());
  } catch {
    res.json([]);
  }
});

// QR code for a bot instance
app.get("/bot/qr/:id", async (req, res) => {
  const botUrl = process.env.BOT_URL || "http://bot:4020";
  try {
    const r = await fetch(`${botUrl}/qr/${req.params.id}`);
    res.json(await r.json());
  } catch {
    res.json({ status: "unreachable", qr: null });
  }
});

// Restart a bot instance
app.post("/bot/restart/:id", async (req, res) => {
  const botUrl = process.env.BOT_URL || "http://bot:4020";
  try {
    const r = await fetch(`${botUrl}/restart/${req.params.id}`, { method: "POST" });
    res.json(await r.json());
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

// Logout bot instance
app.post("/bot/logout/:id", async (req, res) => {
  const botUrl = process.env.BOT_URL || "http://bot:4020";
  try { const r = await fetch(`${botUrl}/logout/${req.params.id}`, { method: "POST" }); res.json(await r.json()); }
  catch (e: any) { res.status(502).json({ error: e.message }); }
});

// Bot debug logs proxy
app.get("/bot/logs/:id", async (req, res) => {
  const botUrl = process.env.BOT_URL || "http://bot:4020";
  try { const r = await fetch(`${botUrl}/logs/${req.params.id}`); res.json(await r.json()); }
  catch { res.json({ id: req.params.id, logs: [] }); }
});

app.get("/bot/logs", async (_req, res) => {
  const botUrl = process.env.BOT_URL || "http://bot:4020";
  try { const r = await fetch(`${botUrl}/logs`); res.json(await r.json()); }
  catch { res.json({}); }
});

// REPORTS
app.get("/reports/daily", async (req, res) => {
  const period = (req.query.period as string) || "day"; // day | month | year
  const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);

  // Calculate date range based on period
  let rangeStart: string, rangeEnd: string, periodLabel: string;
  if (period === "year") {
    const year = dateStr.slice(0, 4);
    rangeStart = `${year}-01-01T00:00:00Z`;
    rangeEnd = `${year}-12-31T23:59:59Z`;
    periodLabel = year;
  } else if (period === "month") {
    const ym = dateStr.slice(0, 7); // YYYY-MM
    const [y, m] = ym.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    rangeStart = `${ym}-01T00:00:00Z`;
    rangeEnd = `${ym}-${lastDay}T23:59:59Z`;
    periodLabel = ym;
  } else {
    rangeStart = `${dateStr}T00:00:00Z`;
    rangeEnd = `${dateStr}T23:59:59Z`;
    periodLabel = dateStr;
  }

  // Leads created in period
  const newLeads = await sql`
    SELECT id, name, phone, country, source, stage, buyer_tier, created_at
    FROM leads
    WHERE created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
    ORDER BY created_at DESC
    LIMIT 200
  `;

  // Incoming messages in period
  const messagesIn = await sql`
    SELECT i.id, i.lead_id, i.body, i.created_at, i.by_user,
           l.name as lead_name, l.phone as lead_phone, l.country as lead_country, l.stage as lead_stage
    FROM interactions i
    JOIN leads l ON l.id = i.lead_id
    WHERE i.kind = 'message_in'
      AND i.created_at >= ${rangeStart} AND i.created_at <= ${rangeEnd}
    ORDER BY i.created_at DESC
    LIMIT 500
  `;

  // Messages in/out count
  const msgCounts = await sql`
    SELECT kind, count(*)::int as total
    FROM interactions
    WHERE kind IN ('message_in', 'message_out')
      AND created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
    GROUP BY kind
  `;
  const messagesInCount = msgCounts.find((r: any) => r.kind === "message_in")?.total || 0;
  const messagesOutCount = msgCounts.find((r: any) => r.kind === "message_out")?.total || 0;

  // Timeline chart — hourly (day), daily (month), monthly (year)
  let timelineData: { label: string; count: number }[];
  if (period === "year") {
    const byMonth = await sql`
      SELECT extract(month from created_at)::int as m, count(*)::int as count
      FROM interactions
      WHERE kind = 'message_in' AND created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
      GROUP BY m ORDER BY m
    `;
    const monthNames = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    timelineData = Array.from({ length: 12 }, (_, i) => ({
      label: monthNames[i + 1],
      count: byMonth.find((r: any) => r.m === i + 1)?.count || 0,
    }));
  } else if (period === "month") {
    const [y, m] = dateStr.slice(0, 7).split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const byDay = await sql`
      SELECT extract(day from created_at)::int as d, count(*)::int as count
      FROM interactions
      WHERE kind = 'message_in' AND created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
      GROUP BY d ORDER BY d
    `;
    timelineData = Array.from({ length: daysInMonth }, (_, i) => ({
      label: String(i + 1),
      count: byDay.find((r: any) => r.d === i + 1)?.count || 0,
    }));
  } else {
    const byHour = await sql`
      SELECT extract(hour from created_at)::int as hour, count(*)::int as count
      FROM interactions
      WHERE kind = 'message_in' AND created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
      GROUP BY hour ORDER BY hour
    `;
    timelineData = Array.from({ length: 24 }, (_, h) => ({
      label: `${h.toString().padStart(2, "0")}:00`,
      count: byHour.find((r: any) => r.hour === h)?.count || 0,
    }));
  }

  // Unique leads
  const uniqueLeads = await sql`
    SELECT count(DISTINCT lead_id)::int as total
    FROM interactions
    WHERE kind = 'message_in' AND created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
  `;

  // New leads count (may be more than the 200 returned)
  const newLeadsCount = await sql`
    SELECT count(*)::int as total FROM leads
    WHERE created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
  `;

  // By source
  const bySource = await sql`
    SELECT coalesce(source, 'desconocido') as source, count(*)::int as count
    FROM leads WHERE created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
    GROUP BY source ORDER BY count DESC
  `;

  // By country
  const byCountry = await sql`
    SELECT coalesce(country, 'Sin país') as country, count(*)::int as count
    FROM leads WHERE created_at >= ${rangeStart} AND created_at <= ${rangeEnd}
    GROUP BY country ORDER BY count DESC
  `;

  // Product interest detection — uses the same classifier as the auto-sync
  const productInterest: Record<string, { count: number; leads: { name: string; phone: string; body: string; time: string }[] }> = {};
  for (const msg of messagesIn) {
    const classified = classifyMessage(msg.body || "");
    for (const product of classified.products) {
      if (!productInterest[product]) productInterest[product] = { count: 0, leads: [] };
      productInterest[product].count++;
      productInterest[product].leads.push({
        name: msg.lead_name || msg.lead_phone || "Sin nombre",
        phone: msg.lead_phone || "",
        body: msg.body || "",
        time: msg.created_at,
      });
    }
  }

  // First-time contacts
  const firstTimeContacts = await sql`
    SELECT l.id, l.name, l.phone, l.country, i.body, i.created_at as first_msg_at
    FROM leads l
    JOIN interactions i ON i.lead_id = l.id AND i.kind = 'message_in'
    WHERE l.created_at >= ${rangeStart} AND l.created_at <= ${rangeEnd}
      AND i.id = (SELECT min(i2.id) FROM interactions i2 WHERE i2.lead_id = l.id AND i2.kind = 'message_in')
    ORDER BY i.created_at DESC LIMIT 100
  `;

  res.json({
    date: periodLabel,
    period,
    range: { start: rangeStart, end: rangeEnd },
    summary: {
      new_leads: newLeadsCount[0]?.total || 0,
      messages_in: messagesInCount,
      messages_out: messagesOutCount,
      unique_leads_contacted: uniqueLeads[0]?.total || 0,
      first_time_contacts: firstTimeContacts.length,
    },
    timeline: timelineData,
    timeline_label: period === "year" ? "Mensajes por mes" : period === "month" ? "Mensajes por día" : "Mensajes por hora",
    by_source: bySource,
    by_country: byCountry,
    product_interest: Object.entries(productInterest)
      .filter(([, v]) => v.count > 0)
      .map(([product, v]) => ({ product, count: v.count, leads: v.leads.slice(0, 20) }))
      .sort((a, b) => b.count - a.count),
    new_leads: newLeads,
    first_contacts: firstTimeContacts,
    recent_messages: messagesIn.slice(0, 100).map((m: any) => ({
      id: m.id, lead_name: m.lead_name, lead_phone: m.lead_phone,
      lead_country: m.lead_country, lead_stage: m.lead_stage,
      body: m.body, time: m.created_at,
    })),
  });
});

// ==================== AI TRAINING ENDPOINTS ====================
// Sistema de entrenamiento personalizable del classifier. Tres recursos:
//   /ai/rules           — CRUD de reglas regex → tag
//   /ai/prompt          — singleton: contexto + categorías + few-shot para Gemini
//   /ai/feedback        — loop de correcciones del operador
//   /ai/test-classify   — sandbox: paste text, ver tags sin persistir
// Migration 012 los crea. El bot lee /ai/rules con cache 60s.

app.get("/ai/rules", async (_req, res) => {
  const rows = await sql`
    SELECT id, name, description, pattern, tag, weight, enabled, hits_count, last_hit_at, source,
           created_by, created_at, updated_at
    FROM ai_rules
    ORDER BY enabled DESC, hits_count DESC, id DESC
  `;
  res.json(rows);
});

app.post("/ai/rules", async (req, res) => {
  const { name, description, pattern, tag, weight, enabled } = req.body ?? {};
  if (!name || !pattern || !tag) {
    return res.status(400).json({ error: "name_pattern_tag_required" });
  }
  // Valida regex no se rompa
  try { new RegExp(pattern); } catch (e: any) {
    return res.status(400).json({ error: "invalid_regex", message: e.message });
  }
  const createdBy = (req as any).user?.email ?? "ui";
  const rows = await sql`
    INSERT INTO ai_rules (name, description, pattern, tag, weight, enabled, created_by)
    VALUES (${name}, ${description ?? null}, ${pattern}, ${tag},
            ${typeof weight === "number" ? weight : 1.0},
            ${enabled !== false}, ${createdBy})
    RETURNING *
  `;
  res.status(201).json(rows[0]);
});

app.patch("/ai/rules/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const { name, description, pattern, tag, weight, enabled } = req.body ?? {};
  if (pattern !== undefined) {
    try { new RegExp(pattern); } catch (e: any) {
      return res.status(400).json({ error: "invalid_regex", message: e.message });
    }
  }
  const rows = await sql`
    UPDATE ai_rules SET
      name        = COALESCE(${name ?? null}, name),
      description = COALESCE(${description ?? null}, description),
      pattern     = COALESCE(${pattern ?? null}, pattern),
      tag         = COALESCE(${tag ?? null}, tag),
      weight      = COALESCE(${typeof weight === "number" ? weight : null}, weight),
      enabled     = COALESCE(${typeof enabled === "boolean" ? enabled : null}, enabled),
      updated_at  = now()
    WHERE id = ${id}
    RETURNING *
  `;
  if (!rows[0]) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

app.delete("/ai/rules/:id", async (req, res) => {
  const id = Number(req.params.id);
  await sql`DELETE FROM ai_rules WHERE id = ${id}`;
  res.json({ ok: true });
});

app.get("/ai/prompt", async (_req, res) => {
  const rows = await sql`SELECT * FROM ai_prompt_override WHERE id = 1`;
  if (!rows[0]) {
    // Defensa: si no hay row singleton (no debería pasar por el INSERT del migration)
    await sql`INSERT INTO ai_prompt_override (id, extra_context, extra_categories, few_shot_examples) VALUES (1, '', '', '[]'::jsonb)`;
    const fresh = await sql`SELECT * FROM ai_prompt_override WHERE id = 1`;
    return res.json(fresh[0]);
  }
  res.json(rows[0]);
});

app.patch("/ai/prompt", async (req, res) => {
  const { extra_context, extra_categories, few_shot_examples, enabled } = req.body ?? {};
  const updatedBy = (req as any).user?.email ?? "ui";
  const rows = await sql`
    UPDATE ai_prompt_override SET
      extra_context     = COALESCE(${extra_context ?? null}, extra_context),
      extra_categories  = COALESCE(${extra_categories ?? null}, extra_categories),
      few_shot_examples = COALESCE(${few_shot_examples !== undefined ? sql.json(few_shot_examples) : null}, few_shot_examples),
      enabled           = COALESCE(${typeof enabled === "boolean" ? enabled : null}, enabled),
      updated_by        = ${updatedBy},
      updated_at        = now()
    WHERE id = 1
    RETURNING *
  `;
  res.json(rows[0]);
});

app.post("/ai/feedback", async (req, res) => {
  const { lead_id, interaction_id, message_text, original_tags, corrected_tags, reason } = req.body ?? {};
  if (!message_text || !Array.isArray(corrected_tags)) {
    return res.status(400).json({ error: "message_text_and_corrected_tags_required" });
  }
  const createdBy = (req as any).user?.email ?? "ui";
  const rows = await sql`
    INSERT INTO ai_feedback (
      lead_id, interaction_id, message_text, original_tags, corrected_tags, reason, created_by
    ) VALUES (
      ${lead_id ?? null}, ${interaction_id ?? null}, ${message_text},
      ${original_tags ?? []}, ${corrected_tags},
      ${reason ?? null}, ${createdBy}
    ) RETURNING *
  `;
  res.status(201).json(rows[0]);
});

app.get("/ai/feedback", async (req, res) => {
  const status = (req.query.status as string) ?? "pending";
  const rows = await sql`
    SELECT f.*, l.name AS lead_name, l.phone AS lead_phone
    FROM ai_feedback f
    LEFT JOIN leads l ON l.id = f.lead_id
    WHERE f.status = ${status}
    ORDER BY f.created_at DESC
    LIMIT 200
  `;
  res.json(rows);
});

// Promueve un feedback a regla nueva.
app.post("/ai/feedback/:id/promote", async (req, res) => {
  const fid = Number(req.params.id);
  const { name, pattern, tag, weight } = req.body ?? {};
  if (!name || !pattern || !tag) {
    return res.status(400).json({ error: "name_pattern_tag_required" });
  }
  try { new RegExp(pattern); } catch (e: any) {
    return res.status(400).json({ error: "invalid_regex", message: e.message });
  }
  const createdBy = (req as any).user?.email ?? "promote";
  const rule = await sql`
    INSERT INTO ai_rules (name, description, pattern, tag, weight, enabled, created_by)
    VALUES (${name}, ${"Promovida desde feedback #" + fid}, ${pattern}, ${tag},
            ${typeof weight === "number" ? weight : 1.0}, TRUE, ${createdBy})
    RETURNING *
  `;
  await sql`
    UPDATE ai_feedback SET
      promoted_to_rule_id = ${rule[0]!.id},
      status              = 'promoted',
      resolved_at         = now()
    WHERE id = ${fid}
  `;
  res.status(201).json(rule[0]);
});

app.post("/ai/feedback/:id/dismiss", async (req, res) => {
  const fid = Number(req.params.id);
  await sql`
    UPDATE ai_feedback SET status = 'dismissed', resolved_at = now()
    WHERE id = ${fid}
  `;
  res.json({ ok: true });
});

// Sandbox: corre las rules contra un texto y devuelve qué tags aplicarían.
app.post("/ai/test-classify", async (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "text_required" });
  }
  const rules = await sql`SELECT id, name, pattern, tag, weight FROM ai_rules WHERE enabled = TRUE`;
  const matched: Array<{ rule_id: number; rule_name: string; tag: string; weight: number }> = [];
  for (const r of rules) {
    try {
      const re = new RegExp(r.pattern, "i");
      if (re.test(text)) {
        matched.push({ rule_id: r.id, rule_name: r.name, tag: r.tag, weight: Number(r.weight) });
      }
    } catch {
      // skip rules con regex roto
    }
  }
  res.json({
    text,
    matched,
    tags: Array.from(new Set(matched.map((m) => m.tag))),
    rules_checked: rules.length,
  });
});

// ==================== END AI TRAINING ENDPOINTS ====================

// ==================== ESCUELA PRODUCTS (catálogo editable) ====================

// GET /products — lista. ?featured=1 para sólo los del flyer activo.
app.get("/products", async (req, res) => {
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

app.get("/products/:id", async (req, res) => {
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

// POST /products — crea producto + (si trae classifier_pattern) crea ai_rule asociada.
app.post("/products", requireAuth, async (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  if (typeof b.nombre !== "string" || !b.nombre.trim()) {
    return res.status(400).json({ error: "nombre_required" });
  }

  // Si vino classifier_pattern, validar regex antes de crear rule
  let aiRuleId: number | null = null;
  if (typeof b.classifier_pattern === "string" && b.classifier_pattern.trim() && typeof b.classifier_tag === "string" && b.classifier_tag.trim()) {
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
      ${req.userEmail ?? 'unknown'}, ${req.userEmail ?? 'unknown'}
    )
    RETURNING *
  `;
  res.json(rows[0]);
});

// PUT /products/:id — actualiza + sincroniza ai_rule asociada.
app.put("/products/:id", requireAuth, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const b = req.body ?? {};

  // Lookup actual para saber si la rule existe
  const cur = await sql`SELECT ai_rule_id FROM escuela_products WHERE id = ${id} LIMIT 1`;
  if (cur.length === 0) return res.status(404).json({ error: "not_found" });
  let aiRuleId: number | null = cur[0].ai_rule_id;

  // Si trajo pattern, validar
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
    // Si explicitly limpia el pattern, deshabilita la rule
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
      updated_by       = ${req.userEmail ?? 'unknown'},
      updated_at       = now()
    WHERE id = ${id}
    RETURNING *
  `;
  res.json(rows[0]);
});

app.delete("/products/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  // soft delete: enabled=false. Conservamos data histórica para reportes.
  const rows = await sql`
    UPDATE escuela_products SET enabled = FALSE, featured = FALSE, updated_at = now()
    WHERE id = ${id}
    RETURNING id
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true, id: rows[0].id });
});

// ==================== END PRODUCTS ====================

// ==================== CONFIGURACIÓN: PIPELINE / INSTANCES / BANCOS ====================

// ── Pipeline stages CRUD ─────────────────────────────────────────────
app.get("/config/pipeline", async (_req, res) => {
  const rows = await sql`
    SELECT id, key, label, color, position, enabled, group_name
      FROM pipeline_stages
     ORDER BY position ASC
  `;
  res.json({ stages: rows });
});

app.put("/config/pipeline", requireAuth, async (req, res) => {
  const stages = (req.body?.stages ?? []) as Array<{
    id?: number; key: string; label: string; color?: string;
    position?: number; enabled?: boolean; group_name?: string;
  }>;
  if (!Array.isArray(stages) || stages.length === 0) {
    return res.status(400).json({ error: "stages_required" });
  }
  // Upsert por key
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    if (!s.key || !s.label) continue;
    await sql`
      INSERT INTO pipeline_stages (key, label, color, position, enabled, group_name)
      VALUES (${s.key}, ${s.label}, ${s.color ?? 'bg-slate-100 text-slate-800'},
              ${s.position ?? i}, ${s.enabled ?? true}, ${s.group_name ?? 'sale'})
      ON CONFLICT (key) DO UPDATE SET
        label = EXCLUDED.label, color = EXCLUDED.color,
        position = EXCLUDED.position, enabled = EXCLUDED.enabled,
        group_name = EXCLUDED.group_name, updated_at = now()
    `;
  }
  const rows = await sql`SELECT id, key, label, color, position, enabled, group_name FROM pipeline_stages ORDER BY position ASC`;
  res.json({ stages: rows });
});


// ── Bot instances ────────────────────────────────────────────────────
app.get("/config/instances", async (_req, res) => {
  const rows = await sql`
    SELECT id, slug, display_name, phone, agent_name, agent_signature,
           product_skus, cuenta_bancaria, yape_numero, extra_prompt,
           rule_ids, enabled, auto_reply, notes,
           created_at, updated_at
      FROM bot_instances
     ORDER BY slug ASC
  `;
  res.json({ instances: rows });
});

app.post("/config/instances", requireAuth, async (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  if (!b.slug || !b.display_name) {
    return res.status(400).json({ error: "slug_and_display_name_required" });
  }
  const rows = await sql`
    INSERT INTO bot_instances (slug, display_name, phone, agent_name, agent_signature,
                               product_skus, cuenta_bancaria, yape_numero, extra_prompt,
                               rule_ids, enabled, auto_reply, notes)
    VALUES (${b.slug}, ${b.display_name}, ${b.phone ?? null},
            ${b.agent_name ?? 'Goberna'}, ${b.agent_signature ?? null},
            ${b.product_skus ?? null}, ${b.cuenta_bancaria ?? null}, ${b.yape_numero ?? null},
            ${b.extra_prompt ?? null}, ${b.rule_ids ?? null},
            ${b.enabled ?? true}, ${b.auto_reply ?? false}, ${b.notes ?? null})
    RETURNING *
  `;
  res.json(rows[0]);
});

app.put("/config/instances/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const b = req.body ?? {};
  const rows = await sql`
    UPDATE bot_instances SET
      slug            = COALESCE(${b.slug ?? null}, slug),
      display_name    = COALESCE(${b.display_name ?? null}, display_name),
      phone           = ${b.phone ?? null},
      agent_name      = COALESCE(${b.agent_name ?? null}, agent_name),
      agent_signature = ${b.agent_signature ?? null},
      product_skus    = ${b.product_skus ?? null},
      cuenta_bancaria = ${b.cuenta_bancaria ?? null},
      yape_numero     = ${b.yape_numero ?? null},
      extra_prompt    = ${b.extra_prompt ?? null},
      rule_ids        = ${b.rule_ids ?? null},
      enabled         = COALESCE(${b.enabled ?? null}, enabled),
      auto_reply      = COALESCE(${b.auto_reply ?? null}, auto_reply),
      notes           = ${b.notes ?? null},
      updated_at      = now()
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

// Copiar configuración de un instance a otro (excepto slug/phone/display_name)
app.post("/config/instances/:id/copy-from/:fromId", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const fromId = Number(req.params.fromId);
  if (!Number.isFinite(id) || !Number.isFinite(fromId)) return res.status(400).json({ error: "invalid_id" });
  const src = await sql`SELECT * FROM bot_instances WHERE id = ${fromId}`;
  if (src.length === 0) return res.status(404).json({ error: "source_not_found" });
  const s = src[0];
  const rows = await sql`
    UPDATE bot_instances SET
      agent_name      = ${s.agent_name},
      agent_signature = ${s.agent_signature},
      product_skus    = ${s.product_skus},
      cuenta_bancaria = ${s.cuenta_bancaria},
      yape_numero     = ${s.yape_numero},
      extra_prompt    = ${s.extra_prompt},
      rule_ids        = ${s.rule_ids},
      updated_at      = now()
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return res.status(404).json({ error: "target_not_found" });
  res.json(rows[0]);
});

app.delete("/config/instances/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  await sql`UPDATE bot_instances SET enabled = FALSE, updated_at = now() WHERE id = ${id}`;
  res.json({ ok: true, id });
});


// ── Bank accounts catálogo ──────────────────────────────────────────
app.get("/config/banks", async (_req, res) => {
  const rows = await sql`SELECT * FROM bank_accounts ORDER BY is_default DESC, name ASC`;
  res.json({ banks: rows });
});

app.post("/config/banks", requireAuth, async (req, res) => {
  const b = req.body ?? {};
  if (!b.name || !b.body) return res.status(400).json({ error: "name_and_body_required" });
  if (b.is_default === true) {
    await sql`UPDATE bank_accounts SET is_default = FALSE`;
  }
  const rows = await sql`
    INSERT INTO bank_accounts (name, body, yape_numero, is_default)
    VALUES (${b.name}, ${b.body}, ${b.yape_numero ?? null}, ${b.is_default ?? false})
    RETURNING *
  `;
  res.json(rows[0]);
});

app.put("/config/banks/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const b = req.body ?? {};
  if (b.is_default === true) {
    await sql`UPDATE bank_accounts SET is_default = FALSE WHERE id <> ${id}`;
  }
  const rows = await sql`
    UPDATE bank_accounts SET
      name = COALESCE(${b.name ?? null}, name),
      body = COALESCE(${b.body ?? null}, body),
      yape_numero = ${b.yape_numero ?? null},
      is_default = COALESCE(${b.is_default ?? null}, is_default),
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

app.delete("/config/banks/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  await sql`DELETE FROM bank_accounts WHERE id = ${id}`;
  res.json({ ok: true });
});

// ==================== END CONFIG ====================

// ==================== HUMAN ATTENTION QUEUE ====================

// GET /attention — queue ordenada por waiting time
app.get("/attention", async (_req, res) => {
  const rows = await sql`SELECT * FROM v_attention_queue LIMIT 200`;
  res.json({ items: rows });
});

// POST /leads/:id/flag-attention — bot llama esto cuando no sabe responder.
// El operador también puede llamarlo manualmente desde el chat.
app.post("/leads/:id/flag-attention", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const reason = (req.body?.reason as string) || "unknown";
  const rows = await sql`
    UPDATE leads
       SET needs_human_attention = TRUE,
           attention_reason = ${reason}
     WHERE id = ${id}
     RETURNING id, needs_human_attention, attention_at
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

// POST /leads/:id/resolve-attention — marca como resuelto
app.post("/leads/:id/resolve-attention", requireAuth, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const rows = await sql`
    UPDATE leads
       SET needs_human_attention = FALSE,
           attention_resolved_by = ${req.userEmail ?? 'unknown'}
     WHERE id = ${id}
     RETURNING id, needs_human_attention, attention_resolved_at, attention_resolved_by
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

// ==================== END ATTENTION ====================

// ==================== CHATS v2 (con tabs: dm / group / attention) ====================
app.get("/chats/v2", async (req, res) => {
  const tab = (req.query.tab as string) || "all";  // all | dm | group | attention
  const search = (req.query.q as string)?.toLowerCase() ?? null;
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  const filters: string[] = [];
  if (tab === "dm")        filters.push("is_group = FALSE");
  if (tab === "group")     filters.push("is_group = TRUE");
  if (tab === "attention") filters.push("needs_human_attention = TRUE");

  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const searchClause = search
    ? `AND (lower(name) LIKE '%' || $1 || '%' OR phone LIKE '%' || $1 || '%' OR lower(coalesce(group_subject,'')) LIKE '%' || $1 || '%')`
    : "";

  const queryStr = `
    SELECT * FROM v_chats_summary
    ${where}
    ${searchClause}
    ORDER BY needs_human_attention DESC, last_message_at DESC NULLS LAST
    LIMIT ${limit}
  `;

  const rows = search
    ? await sql.unsafe(queryStr, [search])
    : await sql.unsafe(queryStr);

  const counts = await sql`
    SELECT
      count(*) FILTER (WHERE is_group = FALSE) AS dm,
      count(*) FILTER (WHERE is_group = TRUE)  AS group_,
      count(*) FILTER (WHERE needs_human_attention) AS attention,
      count(*) AS total
    FROM v_chats_summary
  `;

  res.json({ chats: rows, counts: counts[0] });
});

// Lead enrichment con datos del ERP de Escuela cuando sea cliente histórico.
// Usa escuela_client_id si está, sino busca por phone en lead_360 cross-DB
// (pero lead_360 vive en electoral, así que usamos solo lo que ya está
// poblado en leads-crm via consolidate.sql).
app.get("/leads/:id/enrichment", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const rows = await sql`
    SELECT
      l.id, l.escuela_client_id, l.dni, l.ocupacion, l.fecha_nacimiento,
      l.last_course, l.enrollments_count, l.certificates_count,
      l.buyer_tier, l.total_usd_spent, l.n_purchases,
      l.first_purchase_at, l.last_purchase_year,
      l.is_group, l.group_subject, l.last_chat_kind,
      l.needs_human_attention, l.attention_reason, l.attention_at
    FROM leads l
    WHERE l.id = ${id}
    LIMIT 1
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

// ==================== END CHATS v2 ====================

// ==================== CAMPAIGNS · re-engagement masivo ====================

/**
 * Build dynamic SQL filter from JSONB segment_filter.
 * Supported keys:
 *   buyer_tier: string | { in: string[] }
 *   stage: string | { in: string[] }
 *   country: string
 *   n_purchases: number | { gte / lte / eq }
 *   last_purchase_year: number | { gte / lte }
 *   days_since_contact: { gte / lte }
 *   days_since_purchase: { lte }
 *   tags: { contains: string }
 *   has_phone: true
 *   escuela_client_id_not_null: true
 */
function buildSegmentSQL(filter: any): { where: string; params: any[] } {
  const conds: string[] = ["l.phone IS NOT NULL"];
  const params: any[] = [];
  const f = filter || {};

  function add(cond: string, ...p: any[]) {
    conds.push(cond);
    params.push(...p);
  }

  if (f.buyer_tier) {
    if (typeof f.buyer_tier === "string") add(`l.buyer_tier = $${params.length + 1}`, f.buyer_tier);
    else if (f.buyer_tier.in) add(`l.buyer_tier = ANY($${params.length + 1}::text[])`, f.buyer_tier.in);
  }
  if (f.stage) {
    if (typeof f.stage === "string") add(`l.stage = $${params.length + 1}`, f.stage);
    else if (f.stage.in) add(`l.stage = ANY($${params.length + 1}::text[])`, f.stage.in);
  }
  if (f.country)        add(`l.country = $${params.length + 1}`, f.country);
  if (f.escuela_client_id_not_null) conds.push("l.escuela_client_id IS NOT NULL");

  if (f.n_purchases !== undefined) {
    if (typeof f.n_purchases === "number") add(`l.n_purchases = $${params.length + 1}`, f.n_purchases);
    else {
      if (f.n_purchases.gte !== undefined) add(`l.n_purchases >= $${params.length + 1}`, f.n_purchases.gte);
      if (f.n_purchases.lte !== undefined) add(`l.n_purchases <= $${params.length + 1}`, f.n_purchases.lte);
    }
  }

  if (f.last_purchase_year) {
    if (typeof f.last_purchase_year === "number") add(`l.last_purchase_year = $${params.length + 1}`, f.last_purchase_year);
    else {
      if (f.last_purchase_year.gte !== undefined) add(`l.last_purchase_year >= $${params.length + 1}`, f.last_purchase_year.gte);
      if (f.last_purchase_year.lte !== undefined) add(`l.last_purchase_year <= $${params.length + 1}`, f.last_purchase_year.lte);
    }
  }

  if (f.days_since_contact) {
    const d = f.days_since_contact;
    if (d.gte !== undefined) {
      add(`(SELECT MAX(created_at) FROM interactions WHERE lead_id = l.id AND kind = 'message_in') < now() - ($${params.length + 1} || ' days')::interval`, String(d.gte));
    }
    if (d.lte !== undefined) {
      add(`(SELECT MAX(created_at) FROM interactions WHERE lead_id = l.id AND kind = 'message_in') > now() - ($${params.length + 1} || ' days')::interval`, String(d.lte));
    }
  }

  if (f.days_since_purchase?.lte !== undefined) {
    add(`l.first_purchase_at > now() - ($${params.length + 1} || ' days')::interval`, String(f.days_since_purchase.lte));
  }

  if (f.tags?.contains) add(`$${params.length + 1} = ANY(l.tags)`, f.tags.contains);

  return { where: conds.join(" AND "), params };
}

// ── List presets ────────────────────────────────────────────────────
app.get("/segment-presets", async (_req, res) => {
  const rows = await sql`SELECT id, slug, name, description, filter, icon FROM segment_presets ORDER BY id`;
  res.json({ presets: rows });
});

// ── Preview segment count + sample ──────────────────────────────────
app.post("/campaigns/preview", requireAuth, async (req, res) => {
  const filter = req.body?.filter ?? {};
  const { where, params } = buildSegmentSQL(filter);
  try {
    const countRes = await sql.unsafe(`SELECT count(*)::int AS n FROM leads l WHERE ${where}`, params);
    const sample = await sql.unsafe(
      `SELECT id, name, phone, country, buyer_tier, total_usd_spent, last_course
         FROM leads l
        WHERE ${where}
        ORDER BY total_usd_spent DESC NULLS LAST
        LIMIT 10`,
      params,
    );
    res.json({ total: countRes[0]?.n ?? 0, sample });
  } catch (e: any) {
    res.status(400).json({ error: "preview_failed", message: e.message });
  }
});

// ── Campaigns CRUD ──────────────────────────────────────────────────
app.get("/campaigns", async (_req, res) => {
  const rows = await sql`SELECT * FROM v_campaign_progress`;
  res.json({ campaigns: rows });
});

app.get("/campaigns/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  const rows = await sql`SELECT * FROM campaigns WHERE id = ${id}`;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

app.post("/campaigns", requireAuth, async (req: AuthedRequest, res) => {
  const b = req.body ?? {};
  if (!b.name) return res.status(400).json({ error: "name_required" });
  const rows = await sql`
    INSERT INTO campaigns (
      name, description, segment_filter,
      template_id, custom_body, custom_image_url, custom_document_url,
      bot_instance_id, throttle_per_min, window_start_hr, window_end_hr,
      created_by
    ) VALUES (
      ${b.name}, ${b.description ?? null}, ${b.segment_filter ?? {}}::jsonb,
      ${b.template_id ?? null}, ${b.custom_body ?? null}, ${b.custom_image_url ?? null}, ${b.custom_document_url ?? null},
      ${b.bot_instance_id ?? null}, ${b.throttle_per_min ?? 10},
      ${b.window_start_hr ?? 9}, ${b.window_end_hr ?? 19},
      ${req.userEmail ?? 'unknown'}
    )
    RETURNING *
  `;
  res.json(rows[0]);
});

app.put("/campaigns/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const rows = await sql`
    UPDATE campaigns SET
      name = COALESCE(${b.name ?? null}, name),
      description = ${b.description ?? null},
      segment_filter = COALESCE(${b.segment_filter ?? null}::jsonb, segment_filter),
      template_id = ${b.template_id ?? null},
      custom_body = ${b.custom_body ?? null},
      custom_image_url = ${b.custom_image_url ?? null},
      custom_document_url = ${b.custom_document_url ?? null},
      bot_instance_id = ${b.bot_instance_id ?? null},
      throttle_per_min = COALESCE(${b.throttle_per_min ?? null}, throttle_per_min),
      window_start_hr = COALESCE(${b.window_start_hr ?? null}, window_start_hr),
      window_end_hr = COALESCE(${b.window_end_hr ?? null}, window_end_hr),
      scheduled_at = ${b.scheduled_at ?? null},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found" });
  res.json(rows[0]);
});

// ── Materialize recipients (create rows in campaign_recipients) ─────
app.post("/campaigns/:id/materialize", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const c = (await sql`SELECT * FROM campaigns WHERE id = ${id}`)[0];
  if (!c) return res.status(404).json({ error: "not_found" });
  const { where, params } = buildSegmentSQL(c.segment_filter || {});

  // Insert recipients dedup'd by lead_id (UNIQUE constraint)
  const queryStr = `
    INSERT INTO campaign_recipients (campaign_id, lead_id)
    SELECT $${params.length + 1}, l.id FROM leads l WHERE ${where}
    ON CONFLICT (campaign_id, lead_id) DO NOTHING
  `;
  await sql.unsafe(queryStr, [...params, id]);

  const counts = await sql`
    SELECT count(*)::int AS total FROM campaign_recipients WHERE campaign_id = ${id}
  `;
  await sql`UPDATE campaigns SET total_recipients = ${counts[0].total}, updated_at = now() WHERE id = ${id}`;

  res.json({ ok: true, total_recipients: counts[0].total });
});

// ── Launch campaign (schedule pending recipients) ───────────────────
app.post("/campaigns/:id/launch", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const rows = await sql`
    UPDATE campaigns SET
      status = 'running',
      started_at = COALESCE(started_at, now()),
      scheduled_at = COALESCE(scheduled_at, now()),
      updated_at = now()
    WHERE id = ${id} AND status IN ('draft','scheduled','paused')
    RETURNING *
  `;
  if (rows.length === 0) return res.status(404).json({ error: "not_found_or_invalid_state" });
  res.json(rows[0]);
});

// ── Pause / Cancel ──────────────────────────────────────────────────
app.post("/campaigns/:id/pause", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  await sql`UPDATE campaigns SET status = 'paused', updated_at = now() WHERE id = ${id} AND status = 'running'`;
  res.json({ ok: true });
});
app.post("/campaigns/:id/cancel", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  await sql`UPDATE campaigns SET status = 'cancelled', completed_at = now(), updated_at = now() WHERE id = ${id}`;
  res.json({ ok: true });
});

// ── Bot pulls next batch of pending recipients (called every minute) ──
app.get("/campaigns/queue", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const now = new Date();
  const hr = now.getUTCHours() - 5;  // Lima UTC-5
  const hour = (hr + 24) % 24;
  // Fetch up to N pending recipients across active campaigns,
  // respecting throttle + window
  const rows = await sql`
    SELECT
      r.id AS recipient_id, r.campaign_id, r.lead_id,
      l.phone, l.name, l.country,
      c.template_id, c.custom_body, c.custom_image_url, c.custom_document_url,
      c.window_start_hr, c.window_end_hr, c.bot_instance_id,
      t.body AS template_body, t.image_url AS template_image_url,
      t.document_url AS template_document_url,
      t.document_filename, t.document_mime, t.video_url AS template_video_url,
      t.media_kind
    FROM campaign_recipients r
    JOIN campaigns c ON c.id = r.campaign_id
    JOIN leads l ON l.id = r.lead_id
    LEFT JOIN templates t ON t.id = c.template_id
    WHERE r.status = 'pending'
      AND c.status = 'running'
      AND ${hour} BETWEEN c.window_start_hr AND c.window_end_hr - 1
    ORDER BY r.id ASC
    LIMIT ${limit}
  `;
  res.json({ items: rows });
});

// ── Bot reports send result for a recipient ─────────────────────────
app.post("/campaigns/recipient/:id/sent", async (req, res) => {
  const id = Number(req.params.id);
  const { message_id } = req.body ?? {};
  await sql`
    UPDATE campaign_recipients SET status = 'sent', message_id = ${message_id ?? null}, sent_at = now(), updated_at = now()
    WHERE id = ${id}
  `;
  // Bump campaign sent_count
  await sql`
    UPDATE campaigns SET sent_count = sent_count + 1, updated_at = now()
    WHERE id = (SELECT campaign_id FROM campaign_recipients WHERE id = ${id})
  `;
  // Auto-complete if no more pending
  await sql`
    UPDATE campaigns c SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE c.id = (SELECT campaign_id FROM campaign_recipients WHERE id = ${id})
      AND c.status = 'running'
      AND NOT EXISTS (SELECT 1 FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'pending')
  `;
  res.json({ ok: true });
});

app.post("/campaigns/recipient/:id/failed", async (req, res) => {
  const id = Number(req.params.id);
  const { error_msg } = req.body ?? {};
  await sql`
    UPDATE campaign_recipients SET status = 'failed', error_msg = ${error_msg ?? null}, updated_at = now()
    WHERE id = ${id}
  `;
  await sql`
    UPDATE campaigns SET failed_count = failed_count + 1, updated_at = now()
    WHERE id = (SELECT campaign_id FROM campaign_recipients WHERE id = ${id})
  `;
  res.json({ ok: true });
});

// ==================== END CAMPAIGNS ====================

// ==================== RECOMMENDATIONS · "a quiénes hablar ahora" ====================

/**
 * Sistema de scoring que devuelve los mejores leads para contactar HOY.
 * Combina señales:
 *   1. Compradores VIP sin contacto reciente (high LTV, easy win-back).
 *   2. Tags interés:* sin compra (hot leads — preguntaron por algo).
 *   3. Stage interested estancado.
 *   4. Egresados recientes (cross-sell).
 *   5. Cliente ERP histórico que volvió a escribir hace poco.
 *
 * Cada lead recibe un score 0-100 + razones legibles.
 */
app.get("/recommendations", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const reason = (req.query.reason as string) || "all";  // all | vip_inactive | hot_interest | stuck | crosssell

  const rows = await sql`
    WITH lead_signals AS (
      SELECT
        l.id, l.name, l.phone, l.country, l.stage, l.tags, l.buyer_tier,
        l.total_usd_spent, l.n_purchases, l.last_course,
        l.escuela_client_id, l.dni, l.ocupacion,
        (SELECT MAX(created_at) FROM interactions
          WHERE lead_id = l.id AND kind = 'message_in') AS last_inbound,
        (SELECT MAX(created_at) FROM interactions
          WHERE lead_id = l.id AND kind = 'message_out') AS last_outbound,
        EXTRACT(DAY FROM now() - (SELECT MAX(created_at) FROM interactions
          WHERE lead_id = l.id AND kind = 'message_in'))::int AS days_since_in,
        (SELECT count(*) FROM interactions WHERE lead_id = l.id AND kind = 'message_in') AS msgs_in_count,
        EXISTS(
          SELECT 1 FROM unnest(l.tags) t
          WHERE t LIKE 'interés:%' OR t LIKE 'producto:%'
        ) AS has_interest_tag
      FROM leads l
      WHERE l.phone IS NOT NULL
    ),
    scored AS (
      SELECT *,
        -- VIP inactivo (60+ días sin contacto)
        CASE WHEN buyer_tier = 'vip' AND days_since_in BETWEEN 30 AND 365 THEN 30 ELSE 0 END
        -- Hot lead con tag de interés sin compra
        + CASE WHEN has_interest_tag AND n_purchases = 0 AND days_since_in <= 14 THEN 35 ELSE 0 END
        -- Stage interested estancado (con conversación reciente)
        + CASE WHEN stage = 'interested' AND days_since_in BETWEEN 3 AND 30 THEN 25 ELSE 0 END
        -- Repeat buyer (alto LTV potential)
        + CASE WHEN buyer_tier = 'repeat' AND days_since_in <= 60 THEN 20 ELSE 0 END
        -- Compró hace poco (cross-sell)
        + CASE WHEN n_purchases >= 1 AND last_course IS NOT NULL AND days_since_in <= 14 THEN 15 ELSE 0 END
        -- Cliente ERP que escribió recientemente (high signal)
        + CASE WHEN escuela_client_id IS NOT NULL AND days_since_in <= 7 THEN 25 ELSE 0 END
        -- Penalty si hace muy poco lo contactamos (last_outbound < 24h)
        - CASE WHEN last_outbound > now() - interval '1 day' THEN 30 ELSE 0 END
        AS score,

        -- Razones (array de strings)
        ARRAY(
          SELECT r FROM (VALUES
            (CASE WHEN buyer_tier = 'vip' AND days_since_in BETWEEN 30 AND 365 THEN 'VIP inactivo' END),
            (CASE WHEN has_interest_tag AND n_purchases = 0 AND days_since_in <= 14 THEN 'Hot lead con interés' END),
            (CASE WHEN stage = 'interested' AND days_since_in BETWEEN 3 AND 30 THEN 'Interesado estancado' END),
            (CASE WHEN buyer_tier = 'repeat' AND days_since_in <= 60 THEN 'Repeat buyer' END),
            (CASE WHEN n_purchases >= 1 AND last_course IS NOT NULL AND days_since_in <= 14 THEN 'Cross-sell' END),
            (CASE WHEN escuela_client_id IS NOT NULL AND days_since_in <= 7 THEN 'Cliente ERP activo' END)
          ) AS t(r) WHERE r IS NOT NULL
        ) AS reasons
      FROM lead_signals
      WHERE days_since_in IS NOT NULL
    )
    SELECT id, name, phone, country, stage, tags, buyer_tier,
           total_usd_spent::float, n_purchases, last_course,
           escuela_client_id, days_since_in, msgs_in_count,
           score, reasons,
           last_inbound::text, last_outbound::text
    FROM scored
    WHERE score > 0
    ${reason === "vip_inactive"  ? sql`AND 'VIP inactivo' = ANY(reasons)` :
      reason === "hot_interest"  ? sql`AND 'Hot lead con interés' = ANY(reasons)` :
      reason === "stuck"         ? sql`AND 'Interesado estancado' = ANY(reasons)` :
      reason === "crosssell"     ? sql`AND 'Cross-sell' = ANY(reasons)` :
      sql``}
    ORDER BY score DESC, days_since_in ASC
    LIMIT ${limit}
  `;

  res.json({ items: rows });
});

// ──── Distinct values para filter UI (countries, tags, courses) ────
app.get("/lead-facets", async (_req, res) => {
  const [countries, tags, courses, tiers, stages] = await Promise.all([
    sql`
      SELECT country, count(*)::int AS n
      FROM leads WHERE country IS NOT NULL AND country <> ''
      GROUP BY country ORDER BY n DESC LIMIT 30
    `,
    sql`
      SELECT t AS tag, count(*)::int AS n
      FROM leads, unnest(tags) AS t
      WHERE t IS NOT NULL AND t <> ''
      GROUP BY t ORDER BY n DESC LIMIT 50
    `,
    sql`
      SELECT last_course AS course, count(*)::int AS n
      FROM leads WHERE last_course IS NOT NULL AND last_course <> ''
      GROUP BY last_course ORDER BY n DESC LIMIT 30
    `,
    sql`SELECT buyer_tier AS tier, count(*)::int AS n FROM leads WHERE buyer_tier IS NOT NULL GROUP BY buyer_tier ORDER BY n DESC`,
    sql`SELECT stage, count(*)::int AS n FROM leads WHERE stage IS NOT NULL GROUP BY stage ORDER BY n DESC`,
  ]);
  res.json({ countries, tags, courses, tiers, stages });
});

// ==================== END RECOMMENDATIONS ====================

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[api] unhandled error:", err);
  res.status(500).json({ error: "server_error", message: err?.message ?? "unknown" });
});

async function boot() {
  try { await migrate(); }
  catch (e) { console.error("[api] migration failed, exiting:", e); process.exit(1); }
  

app.listen(PORT, () => console.log(`nexus-backend listening on http://localhost:${PORT}`));
}
boot();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    console.log(`[api] ${sig} received, closing…`);
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
}

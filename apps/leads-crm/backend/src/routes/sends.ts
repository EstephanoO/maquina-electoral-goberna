import { Router } from "express";
import { db, type SendStatus } from "../db.js";
import { renderTemplate } from "../lib/template.js";

export const sendsRouter = Router();

sendsRouter.get("/sends", async (req, res) => {
  const { status, assigned_to, available_now } = req.query as Record<string, string | undefined>;
  res.json(await db.listSends({
    status: status as SendStatus | undefined,
    assigned_to,
    availableNow: available_now === "1" || available_now === "true",
  }));
});

sendsRouter.post("/sends", async (req, res) => {
  const { lead_ids, body, assigned_to, image_url, scheduled_at } = req.body as {
    lead_ids?: number[]; body?: string; assigned_to?: string;
    image_url?: string | null; scheduled_at?: string | null;
  };
  if (!Array.isArray(lead_ids) || lead_ids.length === 0) return res.status(400).json({ error: "lead_ids_required" });
  if (!body?.trim() && !image_url) return res.status(400).json({ error: "body_or_image_required" });

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

sendsRouter.patch("/sends/:id", async (req, res) => {
  const updated = await db.updateSend(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: "not_found" });
  res.json(updated);
});

sendsRouter.delete("/sends/:id", async (req, res) => {
  const ok = await db.cancelSend(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "not_found" });
  res.status(204).end();
});

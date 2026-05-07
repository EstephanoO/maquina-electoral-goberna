import { Router } from "express";
import { db } from "../db.js";
import { previewVariants } from "../lib/template.js";
import { uploadMiddleware } from "../services/uploads.js";
import { embedTemplateInBackground } from "../services/embed.js";

export const templatesRouter = Router();

templatesRouter.get("/templates", async (_req, res) => {
  res.json(await db.listTemplates());
});

templatesRouter.get("/templates/:id", async (req, res) => {
  const t = await db.getTemplate(Number(req.params.id));
  if (!t) return res.status(404).json({ error: "not_found" });
  res.json(t);
});

templatesRouter.post("/templates", async (req, res) => {
  const { name, body, image_url } = req.body ?? {};
  if (!name || !body) return res.status(400).json({ error: "name_and_body_required" });
  const t = await db.createTemplate({ name, body, image_url });
  // Fire-and-forget embed — si falla, getTemplatesNeedingEmbed lo recupera.
  embedTemplateInBackground(t.id, t.body);
  res.status(201).json(t);
});

templatesRouter.patch("/templates/:id", async (req, res) => {
  const t = await db.updateTemplate(Number(req.params.id), req.body);
  if (!t) return res.status(404).json({ error: "not_found" });
  // Si body cambió, re-embed.
  if (req.body?.body !== undefined) embedTemplateInBackground(t.id, t.body);
  res.json(t);
});

templatesRouter.delete("/templates/:id", async (req, res) => {
  const ok = await db.removeTemplate(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "not_found" });
  res.status(204).end();
});

templatesRouter.post("/templates/upload", uploadMiddleware.single("image"), (req, res) => {
  const f = (req as any).file;
  if (!f) return res.status(400).json({ error: "no_file" });
  res.json({ url: `/uploads/${f.filename}` });
});

templatesRouter.post("/templates/preview", (req, res) => {
  const { body, sample } = req.body ?? {};
  if (!body) return res.status(400).json({ error: "body_required" });
  res.json(previewVariants(body, sample ?? {
    nombre: "María", nombre_completo: "María González",
    curso: "Oratoria", nivel: "medio", telefono: "+51999888777",
    asignado: "Carolina",
  }));
});

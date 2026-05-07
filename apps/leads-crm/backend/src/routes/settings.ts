import { Router } from "express";
import { db, invalidatePrefixCache } from "../db.js";
import { DEFAULT_COUNTRY_PREFIXES } from "../lib/country.js";
import type { AuthedRequest } from "../auth.js";

/**
 * Settings key-value singleton store. Usado para active_sessions, anti-ban,
 * country_prefixes, sender_phones y otros valores globales sin schema fijo.
 *   country_prefixes  → cache invalidado al PUT (db.ts mantiene memo en memoria)
 *   PUT requiere role=admin (no operadores)
 */
export const settingsRouter = Router();

settingsRouter.get("/settings/:key", async (req, res) => {
  let v = await db.getSetting(req.params.key);
  // Seed defaults para keys conocidas — el frontend siempre tiene algo que renderizar.
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

settingsRouter.put("/settings/:key", async (req: AuthedRequest, res) => {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "admin_only" });
  await db.setSetting(String(req.params.key), req.body);
  if (req.params.key === "country_prefixes") invalidatePrefixCache();
  res.json({ ok: true });
});

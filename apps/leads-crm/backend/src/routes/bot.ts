import { Router } from "express";

/**
 * Bot proxy — el backend re-expone el dashboard del bot al frontend para evitar
 * que la web haga CORS al http://bot:4020 (interno docker network). Mantiene
 * un único origin desde la perspectiva del navegador.
 */

export const botRouter = Router();
const BOT_URL = () => process.env.BOT_URL || "http://bot:4020";

botRouter.get("/bot/status", async (_req, res) => {
  try {
    const r = await fetch(`${BOT_URL()}/status`);
    res.json(await r.json());
  } catch {
    res.json([]);
  }
});

botRouter.get("/bot/qr/:id", async (req, res) => {
  try {
    const r = await fetch(`${BOT_URL()}/qr/${req.params.id}`);
    res.json(await r.json());
  } catch {
    res.json({ status: "unreachable", qr: null });
  }
});

botRouter.post("/bot/restart/:id", async (req, res) => {
  try {
    const r = await fetch(`${BOT_URL()}/restart/${req.params.id}`, { method: "POST" });
    res.json(await r.json());
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

botRouter.post("/bot/logout/:id", async (req, res) => {
  try {
    const r = await fetch(`${BOT_URL()}/logout/${req.params.id}`, { method: "POST" });
    res.json(await r.json());
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

botRouter.get("/bot/logs/:id", async (req, res) => {
  try {
    const r = await fetch(`${BOT_URL()}/logs/${req.params.id}`);
    res.json(await r.json());
  } catch {
    res.json({ id: req.params.id, logs: [] });
  }
});

botRouter.get("/bot/logs", async (_req, res) => {
  try {
    const r = await fetch(`${BOT_URL()}/logs`);
    res.json(await r.json());
  } catch {
    res.json({});
  }
});

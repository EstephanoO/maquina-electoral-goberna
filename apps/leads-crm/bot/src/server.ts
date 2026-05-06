/** Express server — dashboard + API for bot instances */

import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import { CONFIG } from "./config.js";
import { debugLogs, type WAInstance } from "./wa-instance.js";

export function createServer(instances: Map<string, WAInstance>) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Status of all instances
  app.get("/status", (_req, res) => {
    res.json([...instances.values()].map((i) => {
      const s = i.state;
      return { id: s.id, label: s.label, phone: s.phone, status: s.status, hasQR: !!s.qr, stats: s.stats };
    }));
  });

  // QR code for a specific instance
  app.get("/qr/:id", async (req, res) => {
    const inst = instances.get(req.params.id);
    if (!inst) return res.status(404).json({ error: "instance not found" });
    const { status, qr } = inst.state;
    res.json({ status, qr });
  });

  // QR as PNG image
  app.get("/qr/:id/image", async (req, res) => {
    const inst = instances.get(req.params.id);
    if (!inst?.state.qr) return res.status(404).send("No QR available");
    try {
      const buf = await QRCode.toBuffer(inst.state.qr, { width: 300, margin: 2 });
      res.set("Content-Type", "image/png").send(buf);
    } catch {
      res.status(500).send("QR generation failed");
    }
  });

  // Send message from a specific instance
  app.post("/send/:id", async (req, res) => {
    const inst = instances.get(req.params.id);
    if (!inst) return res.status(404).json({ error: "instance not found" });
    if (inst.state.status !== "ready") return res.status(400).json({ error: "not ready", status: inst.state.status });
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: "phone and message required" });
    try {
      await inst.sendMessage(phone, message);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Restart an instance
  app.post("/restart/:id", async (req, res) => {
    const inst = instances.get(req.params.id);
    if (!inst) return res.status(404).json({ error: "instance not found" });
    try {
      await inst.restart();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Logout: disconnect + delete session
  app.post("/logout/:id", async (req, res) => {
    const inst = instances.get(req.params.id);
    if (!inst) return res.status(404).json({ error: "instance not found" });
    try {
      await inst.logout();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Check if a phone number exists on WhatsApp (diagnostic)
  app.get("/onwhatsapp/:id/:phone", async (req, res) => {
    const inst = instances.get(req.params.id);
    if (!inst) return res.status(404).json({ error: "instance not found" });
    try {
      const result = await inst.checkOnWhatsApp(req.params.phone);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Debug logs for an instance
  app.get("/logs/:id", (req, res) => {
    const logs = debugLogs.get(req.params.id) || [];
    res.json({ id: req.params.id, count: logs.length, logs });
  });

  // All logs
  app.get("/logs", (_req, res) => {
    const all: Record<string, string[]> = {};
    for (const [id, logs] of debugLogs) all[id] = logs;
    res.json(all);
  });

  // Health
  app.get("/health", (_req, res) => {
    const all = [...instances.values()].map((i) => i.state);
    res.json({
      ok: all.some((i) => i.status === "ready"),
      allReady: all.every((i) => i.status === "ready"),
      instances: all.length,
      uptime: process.uptime(),
    });
  });

  // Dashboard
  app.get("/", (_req, res) => {
    const rows = [...instances.values()].map((inst) => {
      const s = inst.state;
      const dot = s.status === "ready" ? "🟢" : s.status === "waiting_qr" ? "🟡" : "🔴";
      const qrLink = s.qr ? `<a href="/qr/${s.id}/image" target="_blank">📱 Escanear QR</a>` : "";
      return `<tr>
        <td>${dot} ${s.label}</td><td><code>${s.phone}</code></td><td>${s.status}</td>
        <td>${qrLink}</td><td>${s.stats.messagesIn} in / ${s.stats.messagesOut} out</td>
        <td>${s.stats.autoReplies}</td><td>${s.stats.errors}</td>
      </tr>`;
    }).join("");

    res.send(`<!DOCTYPE html><html><head><title>Goberna Bot</title><meta charset="utf-8">
<meta http-equiv="refresh" content="10">
<style>body{font-family:system-ui;max-width:900px;margin:40px auto;padding:0 20px;background:#f8fafc}
h1{color:#1e293b}table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}
th{background:#f59e0b;color:#fff;padding:12px;text-align:left;font-size:13px}td{padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px}
code{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:12px}a{color:#f59e0b;font-weight:bold}
.tag{display:inline-block;padding:4px 10px;border-radius:8px;font-size:12px;font-weight:600;margin-top:16px}
.on{background:#dcfce7;color:#166534}.off{background:#fee2e2;color:#991b1b}</style>
</head><body>
<h1>🤖 Goberna Leads Bot <small style="font-weight:400;color:#94a3b8">v0.2 Baileys</small></h1>
<p>Auto-refresh 10s · <code>${CONFIG.apiUrl}</code> · <span class="tag ${CONFIG.autoReply ? "on" : "off"}">Auto-reply: ${CONFIG.autoReply ? "ON" : "OFF"}</span></p>
<table><thead><tr><th>Número</th><th>Teléfono</th><th>Estado</th><th>QR</th><th>Mensajes</th><th>Auto</th><th>Errores</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`);
  });

  return app;
}

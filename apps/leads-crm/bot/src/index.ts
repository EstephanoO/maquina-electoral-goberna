/**
 * Goberna Leads — WhatsApp Bot Service v0.2
 *
 * Baileys-based (WebSocket, no Puppeteer/Chromium).
 * Multi-number, auto-classification, auto-responses.
 */

import { CONFIG } from "./config.js";
import { WAInstance } from "./wa-instance.js";
import { crmApi } from "./crm-api.js";
import { createServer } from "./server.js";

const instances = new Map<string, WAInstance>();

// Baileys occasionally emits unhandled rejections (e.g. stream error during reconnect).
// Log and keep running — don't let a transient socket error crash the whole process.
process.on("unhandledRejection", (reason: any) => {
  const msg = reason?.message || reason?.output?.payload?.message || String(reason);
  console.error("[bot] unhandledRejection:", msg);
});
process.on("uncaughtException", (err: any) => {
  console.error("[bot] uncaughtException:", err?.message || err);
});

async function boot() {
  // Check backend
  try {
    await crmApi.health();
    console.log("[bot] ✓ Backend API connected");
  } catch (e: any) {
    console.warn("[bot] ⚠ Backend API not reachable:", e.message);
  }

  // Start web server
  const app = createServer(instances);
  app.listen(CONFIG.port, () => {
    console.log(`[bot] Dashboard: http://localhost:${CONFIG.port}`);
  });

  // Initialize phone instances
  for (const config of CONFIG.phones) {
    const instance = new WAInstance(config);
    instances.set(config.id, instance);
    await instance.start();
    // Stagger init
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`[bot] ${instances.size} instance(s) initialized`);
}

boot().catch((e) => {
  console.error("[bot] Boot failed:", e);
  process.exit(1);
});

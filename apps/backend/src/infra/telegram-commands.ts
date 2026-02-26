/**
 * GOBERNA — Telegram Bot Command Listener
 *
 * Uses long-polling (getUpdates) to listen for commands in the Goberna group.
 * Currently supports:
 *   /health — Full status report (services + resources)
 *
 * Fire-and-forget, never blocks the main app.
 */

import { statfsSync } from "node:fs";
import os from "node:os";

import type { AppEnv } from "../config/env";
import { db } from "../db";
import { redisClient } from "./redis";
import { fetchWithRetry } from "./upstream";

let _env: AppEnv | null = null;
let _running = false;
let _offset = 0; // Telegram update offset (skip already-processed messages)

// ── Health check helpers (same logic as health-poller) ──────────────

async function checkDatabase(): Promise<boolean> {
  try {
    const r = await db.execute("SELECT 1 AS ok");
    return r.rowCount === 1;
  } catch { return false; }
}

async function checkRedis(): Promise<boolean> {
  try {
    return (await redisClient.ping()) === "PONG";
  } catch { return false; }
}

async function checkTegola(env: AppEnv): Promise<boolean> {
  try {
    const r = await fetchWithRetry(`${env.tegolaBaseUrl}/capabilities`, env);
    return r.ok;
  } catch { return false; }
}

function getUptime(): string {
  const secs = os.uptime();
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
  return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
}

async function buildHealthReport(env: AppEnv): Promise<string> {
  const [dbok, redisok, tegolaok] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkTegola(env),
  ]);

  // System resources
  const load1 = os.loadavg()[0] ?? 0;
  const cpuCount = os.cpus().length || 1;
  const cpuPct = Math.min(100, (load1 / cpuCount) * 100);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPct = totalMem > 0 ? (usedMem / totalMem) * 100 : 0;

  let diskUsed = "N/A";
  let diskTotal = "N/A";
  let diskPct = 0;
  try {
    const fs = statfsSync("/");
    const blockSize = Number(fs.bsize);
    const blocks = Number(fs.blocks);
    const avail = Number(fs.bavail);
    const total = blocks * blockSize;
    const used = (blocks - avail) * blockSize;
    diskUsed = formatBytes(used);
    diskTotal = formatBytes(total);
    diskPct = blocks > 0 ? ((blocks - avail) / blocks) * 100 : 0;
  } catch { /* ignore */ }

  const now = new Date().toLocaleString("es-PE", { timeZone: "America/Lima" });
  const uptime = getUptime();

  const svcIcon = (ok: boolean) => (ok ? "✅" : "🔴");

  return [
    `🏥 *Status Report — /health*`,
    `📅 ${now}`,
    `⏱ Uptime: ${uptime}`,
    ``,
    `*Servicios:*`,
    `${svcIcon(dbok)} PostgreSQL`,
    `${svcIcon(redisok)} Redis`,
    `${svcIcon(tegolaok)} Tegola`,
    ``,
    `*Recursos VPS (${formatBytes(totalMem)} RAM):*`,
    `🖥 CPU: ${cpuPct.toFixed(1)}% (load: ${load1.toFixed(2)}, ${cpuCount} cores)`,
    `💾 RAM: ${formatBytes(usedMem)} / ${formatBytes(totalMem)} (${memPct.toFixed(0)}%)`,
    `💿 Disco: ${diskUsed} / ${diskTotal} (${diskPct.toFixed(0)}%)`,
  ].join("\n");
}

// ── Telegram API helpers ────────────────────────────────────────────

function tgApi(method: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${_env!.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function reply(chatId: number, text: string) {
  await tgApi("sendMessage", { chat_id: chatId, text, parse_mode: "Markdown" }).catch(() => {});
}

// ── Polling loop ────────────────────────────────────────────────────

async function pollOnce() {
  if (!_env?.telegramBotToken || !_env?.telegramChatId) return;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${_env.telegramBotToken}/getUpdates?` +
        `offset=${_offset}&timeout=30&allowed_updates=["message"]`,
      { signal: AbortSignal.timeout(35_000) },
    );
    if (!res.ok) return;

    const data = (await res.json()) as {
      ok: boolean;
      result: Array<{
        update_id: number;
        message?: {
          chat: { id: number };
          text?: string;
          entities?: Array<{ type: string; offset: number; length: number }>;
        };
      }>;
    };

    if (!data.ok || !data.result?.length) return;

    for (const update of data.result) {
      _offset = update.update_id + 1;

      const msg = update.message;
      if (!msg?.text) continue;

      // Check if it's a bot command
      const isCommand = msg.entities?.some((e) => e.type === "bot_command" && e.offset === 0);
      const text = msg.text.trim().toLowerCase();

      // Match /health or /health@gobernanotifierbot (group mentions)
      if (isCommand && (text === "/health" || text.startsWith("/health@"))) {
        const report = await buildHealthReport(_env);
        await reply(msg.chat.id, report);
      }
    }
  } catch {
    // Network error, timeout, etc. — just retry on next cycle
  }
}

async function pollLoop() {
  while (_running) {
    await pollOnce();
    // Small gap between polls to avoid tight loops on errors
    if (_running) await new Promise((r) => setTimeout(r, 500));
  }
}

// ── Public API ──────────────────────────────────────────────────────

export function startTelegramCommands(env: AppEnv) {
  if (!env.telegramBotToken || !env.telegramChatId) return;
  _env = env;
  _running = true;
  void pollLoop();
}

export function stopTelegramCommands() {
  _running = false;
}

/**
 * GOBERNA — Telegram Bot Command Listener
 *
 * Uses long-polling (getUpdates) to listen for commands in the Goberna group.
 * Supports:
 *   /health            — Full status report (services + resources)
 *   /reporte           — Resumen global de hoy (todas las campañas)
 *   /agentes           — Top agentes hoy (todas las campañas)
 *   /agentes lambayeque — Top agentes hoy en Lambayeque
 *   /agentes cajamarca  — Top agentes hoy en Cajamarca
 *   /agentes lima       — Top agentes hoy en Lima
 *   /campana <nombre>  — Resumen de campaña específica hoy
 *   /ayuda             — Lista de comandos disponibles
 *
 * Fire-and-forget, never blocks the main app.
 */

import { statfsSync } from "node:fs";
import os from "node:os";

import type { AppEnv } from "../config/env";
import { pool } from "../db";
import { redisClient } from "./redis";
import { fetchWithRetry } from "./upstream";

let _env: AppEnv | null = null;
let _running = false;
let _offset = 0;

// ── Departamento bounding boxes (UTM, excluyendo GPS=0,0) ──────────
// Mapeados desde los datos reales de producción

type DeptoBbox = {
  zona: string;
  minX: number; maxX: number;
  minY: number; maxY: number;
};

const DEPTOS: Record<string, { label: string; emoji: string; bboxes: DeptoBbox[] }> = {
  lambayeque: {
    label: "Lambayeque",
    emoji: "🌽",
    bboxes: [{ zona: "17S", minX: 580000, maxX: 780000, minY: 9097214, maxY: 9350000 }],
  },
  cajamarca: {
    label: "Cajamarca",
    emoji: "⛰️",
    bboxes: [{ zona: "17S", minX: 650000, maxX: 825978, minY: 9350000, maxY: 9985737 }],
  },
  lima: {
    label: "Lima",
    emoji: "🏙️",
    bboxes: [{ zona: "18S", minX: 250000, maxX: 400000, minY: 8630000, maxY: 8720000 }],
  },
  laLibertad: {
    label: "La Libertad",
    emoji: "🌊",
    bboxes: [{ zona: "17S", minX: 534229, maxX: 700000, minY: 9097214, maxY: 9200000 }],
  },
};

const DEPTO_ALIASES: Record<string, string> = {
  lambayeque: "lambayeque",
  "la libertad": "laLibertad",
  libertad: "laLibertad",
  cajamarca: "cajamarca",
  lima: "lima",
};

// ── DB query helpers ────────────────────────────────────────────────

type AgentRow = { encuestador: string; registros: string; telefonos: string };
type CampanaRow = { name: string; total: string };
type GlobalRow = { total: string; agentes: string; campanas: string };

function bboxWhere(bboxes: DeptoBbox[]): string {
  return bboxes
    .map(
      (b) =>
        `(zona = '${b.zona}' AND x BETWEEN ${b.minX} AND ${b.maxX} AND y BETWEEN ${b.minY} AND ${b.maxY})`,
    )
    .join(" OR ");
}

async function getTopAgentesHoy(depto?: string): Promise<AgentRow[]> {
  const now = new Date();
  const limaDayStart = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Lima" }).split(",")[0]!,
  );
  // Midnight Lima time as UTC
  const offsetMs = 5 * 60 * 60 * 1000; // UTC-5
  const dayStartUtc = new Date(limaDayStart.getTime() + offsetMs);

  let whereExtra = "";
  if (depto && DEPTOS[depto]) {
    const bbox = DEPTOS[depto]!.bboxes;
    whereExtra = `AND (${bboxWhere(bbox)})`;
  } else {
    // Exclude GPS=0,0 (lugar_registro records without coords)
    whereExtra = "AND (x > 100000 OR y > 100000)";
  }

  const sql = `
    SELECT
      encuestador,
      COUNT(*) AS registros,
      COUNT(DISTINCT telefono) FILTER (WHERE telefono <> '') AS telefonos
    FROM forms
    WHERE deleted_at IS NULL
      AND created_at >= $1
      AND encuestador IS NOT NULL AND encuestador <> ''
      ${whereExtra}
    GROUP BY encuestador
    ORDER BY registros DESC
    LIMIT 10
  `;

  const res = await pool.query<AgentRow>(sql, [dayStartUtc.toISOString()]);
  return res.rows;
}

async function getResumenHoy(): Promise<GlobalRow> {
  const now = new Date();
  const limaDayStart = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Lima" }).split(",")[0]!,
  );
  const offsetMs = 5 * 60 * 60 * 1000;
  const dayStartUtc = new Date(limaDayStart.getTime() + offsetMs);

  const sql = `
    SELECT
      COUNT(*) AS total,
      COUNT(DISTINCT encuestador_id) AS agentes,
      COUNT(DISTINCT campaign_id) AS campanas
    FROM forms
    WHERE deleted_at IS NULL
      AND created_at >= $1
  `;
  const res = await pool.query<GlobalRow>(sql, [dayStartUtc.toISOString()]);
  return res.rows[0] ?? { total: "0", agentes: "0", campanas: "0" };
}

async function getResumenCampana(nombreBusqueda: string): Promise<string> {
  // Find matching campaign
  const campSql = `
    SELECT id, name FROM campaigns
    WHERE LOWER(name) ILIKE $1
    LIMIT 1
  `;
  const campRes = await pool.query<{ id: string; name: string }>(campSql, [`%${nombreBusqueda.toLowerCase()}%`]);
  if (!campRes.rows.length) {
    return `No encontré ninguna campaña con "${nombreBusqueda}".`;
  }

  const camp = campRes.rows[0]!;

  const now = new Date();
  const limaDayStart = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Lima" }).split(",")[0]!,
  );
  const offsetMs = 5 * 60 * 60 * 1000;
  const dayStartUtc = new Date(limaDayStart.getTime() + offsetMs);

  type StatsRow = { total_hoy: string; agentes_hoy: string; total_acumulado: string };
  const statsSql = `
    SELECT
      COUNT(*) AS total_hoy,
      COUNT(DISTINCT encuestador_id) AS agentes_hoy,
      (SELECT COUNT(*) FROM forms WHERE campaign_id = $1 AND deleted_at IS NULL) AS total_acumulado
    FROM forms
    WHERE campaign_id = $1
      AND deleted_at IS NULL
      AND created_at >= $2
  `;
  const statsRes = await pool.query<StatsRow>(statsSql, [camp.id, dayStartUtc.toISOString()]);
  const stats = statsRes.rows[0] ?? { total_hoy: "0", agentes_hoy: "0", total_acumulado: "0" };

  const agSql = `
    SELECT encuestador, COUNT(*) AS registros
    FROM forms
    WHERE campaign_id = $1 AND deleted_at IS NULL AND created_at >= $2
      AND encuestador IS NOT NULL AND encuestador <> ''
    GROUP BY encuestador
    ORDER BY registros DESC
    LIMIT 5
  `;
  const agRes = await pool.query<{ encuestador: string; registros: string }>(agSql, [camp.id, dayStartUtc.toISOString()]);
  const agentes = agRes.rows;

  const nowStr = new Date().toLocaleString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });
  const lines = [
    `📋 *${camp.name}*`,
    `🕐 Al ${nowStr}`,
    ``,
    `📊 *Hoy:* ${stats.total_hoy} registros | ${stats.agentes_hoy} agentes activos`,
    `📦 *Acumulado:* ${stats.total_acumulado} registros`,
  ];

  if (agentes.length > 0) {
    lines.push(``, `*Top agentes hoy:*`);
    for (const [i, ag] of agentes.entries()) {
      lines.push(`${i + 1}. ${ag.encuestador} — ${ag.registros} reg`);
    }
  } else {
    lines.push(``, `_Sin registros hoy aún._`);
  }

  return lines.join("\n");
}

// ── Report builders ─────────────────────────────────────────────────

async function buildAgentesReport(depto?: string): Promise<string> {
  const agentes = await getTopAgentesHoy(depto);
  const nowStr = new Date().toLocaleString("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
  });

  const deptoInfo = depto ? DEPTOS[depto] : null;
  const titulo = deptoInfo
    ? `${deptoInfo.emoji} *Top Agentes Hoy — ${deptoInfo.label}*`
    : `🏆 *Top Agentes Hoy — Todas las Campañas*`;

  const lines = [titulo, `🕐 Al ${nowStr}`, ``];

  if (!agentes.length) {
    lines.push("_Sin registros hoy aún._");
    return lines.join("\n");
  }

  const medals = ["🥇", "🥈", "🥉"];
  for (const [i, ag] of agentes.entries()) {
    const icon = medals[i] ?? `${i + 1}.`;
    const tel = Number(ag.telefonos) > 0 ? ` (${ag.telefonos} tel únicos)` : "";
    lines.push(`${icon} ${ag.encuestador}`);
    lines.push(`    📝 ${ag.registros} registros${tel}`);
  }

  return lines.join("\n");
}

async function buildResumenReport(): Promise<string> {
  const global = await getResumenHoy();
  const nowStr = new Date().toLocaleString("es-PE", {
    timeZone: "America/Lima",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Also get top 5 agentes
  const agentes = await getTopAgentesHoy();

  const lines = [
    `📊 *Reporte Diario — Goberna*`,
    `📅 ${nowStr}`,
    ``,
    `*Registros hoy:* ${global.total}`,
    `*Agentes activos:* ${global.agentes}`,
    `*Campañas activas:* ${global.campanas}`,
  ];

  if (agentes.length > 0) {
    lines.push(``, `*Top 5 agentes hoy:*`);
    for (const [i, ag] of agentes.slice(0, 5).entries()) {
      lines.push(`${i + 1}. ${ag.encuestador} — ${ag.registros} reg`);
    }
  }

  return lines.join("\n");
}

// ── Health check (unchanged) ─────────────────────────────────────────

async function checkDatabase(): Promise<boolean> {
  try {
    const r = await pool.query("SELECT 1 AS ok");
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

// ── Ayuda ───────────────────────────────────────────────────────────

function buildAyuda(): string {
  return [
    `🤖 *Goberna Bot — Comandos*`,
    ``,
    `*/reporte* — Resumen global de hoy`,
    `*/agentes* — Top agentes hoy (todas las campañas)`,
    `*/agentes lambayeque* — Top agentes en Lambayeque`,
    `*/agentes cajamarca* — Top agentes en Cajamarca`,
    `*/agentes lima* — Top agentes en Lima`,
    `*/campana <nombre>* — Resumen de campaña (ej: /campana cesar vasquez)`,
    `*/health* — Estado del servidor`,
    `*/ayuda* — Esta lista`,
  ].join("\n");
}

// ── Command router ──────────────────────────────────────────────────

async function handleMessage(chatId: number, rawText: string) {
  // Strip bot mention suffix (e.g. /agentes@gobernanotifierbot → /agentes)
  const text = rawText.trim().toLowerCase().replace(/@\w+/, "").trim();

  // /health
  if (text === "/health") {
    const report = await buildHealthReport(_env!);
    await reply(chatId, report);
    return;
  }

  // /ayuda
  if (text === "/ayuda" || text === "/help" || text === "/start") {
    await reply(chatId, buildAyuda());
    return;
  }

  // /reporte
  if (text === "/reporte" || text === "/report") {
    const report = await buildResumenReport();
    await reply(chatId, report);
    return;
  }

  // /agentes [depto]
  if (text.startsWith("/agentes") || text.startsWith("/agents")) {
    const parts = text.split(/\s+/);
    const deptoArg = parts.slice(1).join(" ").trim();
    const deptoKey = deptoArg ? (DEPTO_ALIASES[deptoArg] ?? null) : undefined;

    if (deptoArg && !deptoKey) {
      await reply(
        chatId,
        `No reconozco el departamento "${deptoArg}".\nDepartamentos disponibles: lambayeque, cajamarca, lima, "la libertad"`,
      );
      return;
    }

    const report = await buildAgentesReport(deptoKey ?? undefined);
    await reply(chatId, report);
    return;
  }

  // /campana <nombre>
  if (text.startsWith("/campana") || text.startsWith("/campaign")) {
    const parts = text.split(/\s+/);
    const nombre = parts.slice(1).join(" ").trim();
    if (!nombre) {
      await reply(chatId, "Uso: /campana <nombre>\nEjemplo: /campana cesar vasquez");
      return;
    }
    const report = await getResumenCampana(nombre);
    await reply(chatId, report);
    return;
  }
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
          from?: { id: number };
        };
      }>;
    };

    if (!data.ok || !data.result?.length) return;

    for (const update of data.result) {
      _offset = update.update_id + 1;

      const msg = update.message;
      if (!msg?.text) continue;

      // Only respond to commands (start with /)
      const isCommand = msg.entities?.some((e) => e.type === "bot_command" && e.offset === 0);
      if (!isCommand) continue;

      // Fire and forget — don't block the poll loop
      handleMessage(msg.chat.id, msg.text).catch(() => {});
    }
  } catch {
    // Network error, timeout — retry on next cycle
  }
}

async function pollLoop() {
  while (_running) {
    await pollOnce();
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

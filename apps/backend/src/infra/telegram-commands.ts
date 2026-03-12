/**
 * GOBERNA — Telegram Bot con IA (Gemini)
 *
 * El bot entiende lenguaje natural en español.
 * Gemini interpreta el mensaje, extrae el intent y los parámetros,
 * el bot ejecuta la query SQL correspondiente, y Gemini formatea
 * la respuesta de forma conversacional.
 *
 * Intents soportados:
 *   - top_agentes     → top agentes de hoy (global o por depto/campaña)
 *   - resumen_dia     → resumen global del día
 *   - resumen_campana → stats de una campaña específica
 *   - health          → estado del servidor
 *   - ayuda           → lista de capacidades
 *   - unknown         → Gemini responde directamente si puede
 *
 * Fire-and-forget, nunca bloquea el main app.
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

// ── Bounding boxes UTM por departamento ────────────────────────────

type DeptoBbox = { zona: string; minX: number; maxX: number; minY: number; maxY: number };

const DEPTOS: Record<string, { label: string; bboxes: DeptoBbox[] }> = {
  lambayeque:  { label: "Lambayeque",  bboxes: [{ zona: "17S", minX: 580000, maxX: 780000, minY: 9097214, maxY: 9350000 }] },
  cajamarca:   { label: "Cajamarca",   bboxes: [{ zona: "17S", minX: 650000, maxX: 825978, minY: 9350000, maxY: 9985737 }] },
  lima:        { label: "Lima",        bboxes: [{ zona: "18S", minX: 250000, maxX: 400000, minY: 8630000, maxY: 8720000 }] },
  laLibertad:  { label: "La Libertad", bboxes: [{ zona: "17S", minX: 534229, maxX: 700000, minY: 9097214, maxY: 9200000 }] },
};

// ── Gemini API ──────────────────────────────────────────────────────

type GeminiIntent = {
  intent: "top_agentes" | "resumen_dia" | "resumen_campana" | "health" | "ayuda" | "unknown";
  depto?: string;       // clave de DEPTOS si aplica
  campana?: string;     // nombre parcial de campaña
  periodo?: "hoy" | "semana" | "mes";  // default "hoy"
  mensaje_directo?: string; // si intent=unknown, Gemini responde directamente
};

const SYSTEM_PROMPT = `Eres el asistente interno de Goberna, una plataforma de operación territorial para campañas políticas en Perú.
Tu trabajo es interpretar mensajes de los coordinadores de campaña y extraer el intent y parámetros.

Departamentos disponibles en el sistema (y sus alias comunes):
- lambayeque: lambayeque, chiclayo, ferreñafe
- cajamarca: cajamarca
- lima: lima, lima norte, lima sur
- laLibertad: la libertad, trujillo

Responde SIEMPRE con un JSON válido con esta estructura exacta:
{
  "intent": "top_agentes" | "resumen_dia" | "resumen_campana" | "health" | "ayuda" | "unknown",
  "depto": "<clave de depto o null>",
  "campana": "<nombre parcial de campaña o null>",
  "periodo": "hoy" | "semana" | "mes",
  "mensaje_directo": "<respuesta directa si intent=unknown, sino null>"
}

Reglas:
- Si piden "mejores agentes", "top agentes", "quién llevó más", "ranking" → intent: top_agentes
- Si piden "resumen", "cómo vamos", "cuántos registros" sin especificar campaña → intent: resumen_dia
- Si mencionan el nombre de una persona o campaña específica → intent: resumen_campana, campana: el nombre
- Si piden "/health", "estado del servidor", "está caído" → intent: health
- Si preguntan qué puede hacer el bot → intent: ayuda
- Si preguntan algo que no tiene datos en el sistema → intent: unknown, mensaje_directo: respuesta breve
- periodo por defecto es "hoy" salvo que digan "esta semana" o "este mes"
- SOLO devuelve el JSON, sin texto extra, sin markdown, sin bloques de código`;

async function geminiParseIntent(userMessage: string): Promise<GeminiIntent> {
  if (!_env?.geminiApiKey) {
    // Fallback sin IA: solo detecta comandos básicos por texto
    const t = userMessage.toLowerCase();
    if (t.includes("health") || t.includes("servidor")) return { intent: "health" };
    if (t.includes("ayuda") || t.includes("comandos")) return { intent: "ayuda" };
    if (t.includes("resumen") || t.includes("cuántos") || t.includes("cuantos")) return { intent: "resumen_dia" };
    return { intent: "top_agentes", periodo: "hoy" };
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${_env.geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: userMessage }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!res.ok) return { intent: "unknown", mensaje_directo: "No pude procesar tu mensaje." };

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    // Strip possible markdown code block wrapping
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    return JSON.parse(cleaned) as GeminiIntent;
  } catch {
    return { intent: "unknown", mensaje_directo: "Tuve un problema procesando tu pregunta. Intenta de nuevo." };
  }
}

async function geminiFormatResponse(datos: unknown, preguntaOriginal: string): Promise<string> {
  if (!_env?.geminiApiKey) return String(datos);

  try {
    const prompt = `Eres el asistente de Goberna. El usuario preguntó: "${preguntaOriginal}"
Los datos de la base de datos son:
${JSON.stringify(datos, null, 2)}

Formatea una respuesta clara, concisa y en español para enviar por WhatsApp/Telegram.
Usa emojis moderadamente. Destaca los números importantes con *negrita*.
Máximo 20 líneas. No agregues información que no esté en los datos.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${_env.geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!res.ok) return String(datos);
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? String(datos);
  } catch {
    return String(datos);
  }
}

// ── DB queries ──────────────────────────────────────────────────────

function bboxWhere(bboxes: DeptoBbox[]): string {
  return bboxes
    .map((b) => `(zona = '${b.zona}' AND x BETWEEN ${b.minX} AND ${b.maxX} AND y BETWEEN ${b.minY} AND ${b.maxY})`)
    .join(" OR ");
}

function periodFilter(periodo: string = "hoy"): Date {
  const now = new Date();
  const lima = new Date(now.toLocaleString("en-US", { timeZone: "America/Lima" }));
  if (periodo === "semana") {
    lima.setDate(lima.getDate() - lima.getDay()); // inicio de semana
  } else if (periodo === "mes") {
    lima.setDate(1);
  }
  lima.setHours(0, 0, 0, 0);
  // Convert Lima midnight back to UTC
  return new Date(lima.getTime() + 5 * 60 * 60 * 1000);
}

async function queryTopAgentes(depto?: string, periodo?: string) {
  const since = periodFilter(periodo);

  let whereExtra = "";
  if (depto && DEPTOS[depto]) {
    whereExtra = `AND (${bboxWhere(DEPTOS[depto]!.bboxes)})`;
  } else {
    whereExtra = "AND (x > 100000 OR y > 100000)";
  }

  const res = await pool.query<{ encuestador: string; registros: string; telefonos: string }>(
    `SELECT encuestador,
            COUNT(*) AS registros,
            COUNT(DISTINCT telefono) FILTER (WHERE telefono <> '') AS telefonos
     FROM forms
     WHERE deleted_at IS NULL
       AND created_at >= $1
       AND encuestador IS NOT NULL AND encuestador <> ''
       ${whereExtra}
     GROUP BY encuestador
     ORDER BY registros DESC
     LIMIT 10`,
    [since.toISOString()],
  );

  return {
    depto: depto ? DEPTOS[depto]?.label : "Todas las campañas",
    periodo: periodo ?? "hoy",
    agentes: res.rows.map((r, i) => ({
      posicion: i + 1,
      nombre: r.encuestador,
      registros: Number(r.registros),
      telefonos_unicos: Number(r.telefonos),
    })),
  };
}

async function queryResumenDia(periodo?: string) {
  const since = periodFilter(periodo);

  const res = await pool.query<{ total: string; agentes: string; campanas: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(DISTINCT encuestador_id) AS agentes,
            COUNT(DISTINCT campaign_id) AS campanas
     FROM forms
     WHERE deleted_at IS NULL AND created_at >= $1`,
    [since.toISOString()],
  );

  const top = await pool.query<{ encuestador: string; registros: string }>(
    `SELECT encuestador, COUNT(*) AS registros
     FROM forms
     WHERE deleted_at IS NULL AND created_at >= $1
       AND encuestador IS NOT NULL AND encuestador <> ''
       AND (x > 100000 OR y > 100000)
     GROUP BY encuestador ORDER BY registros DESC LIMIT 5`,
    [since.toISOString()],
  );

  const row = res.rows[0] ?? { total: "0", agentes: "0", campanas: "0" };
  return {
    periodo: periodo ?? "hoy",
    total_registros: Number(row.total),
    agentes_activos: Number(row.agentes),
    campanas_activas: Number(row.campanas),
    top_agentes: top.rows.map((r) => ({ nombre: r.encuestador, registros: Number(r.registros) })),
  };
}

async function queryResumenCampana(nombreCampana: string, periodo?: string) {
  const since = periodFilter(periodo);

  const campRes = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM campaigns WHERE LOWER(name) ILIKE $1 LIMIT 1`,
    [`%${nombreCampana.toLowerCase()}%`],
  );

  if (!campRes.rows.length) {
    return { error: `No encontré ninguna campaña con el nombre "${nombreCampana}".` };
  }

  const camp = campRes.rows[0]!;

  const statsRes = await pool.query<{ total_periodo: string; agentes_periodo: string; total_acumulado: string }>(
    `SELECT COUNT(*) AS total_periodo,
            COUNT(DISTINCT encuestador_id) AS agentes_periodo,
            (SELECT COUNT(*) FROM forms WHERE campaign_id = $1 AND deleted_at IS NULL) AS total_acumulado
     FROM forms
     WHERE campaign_id = $1 AND deleted_at IS NULL AND created_at >= $2`,
    [camp.id, since.toISOString()],
  );

  const agRes = await pool.query<{ encuestador: string; registros: string }>(
    `SELECT encuestador, COUNT(*) AS registros
     FROM forms
     WHERE campaign_id = $1 AND deleted_at IS NULL AND created_at >= $2
       AND encuestador IS NOT NULL AND encuestador <> ''
     GROUP BY encuestador ORDER BY registros DESC LIMIT 5`,
    [camp.id, since.toISOString()],
  );

  const stats = statsRes.rows[0] ?? { total_periodo: "0", agentes_periodo: "0", total_acumulado: "0" };
  return {
    campana: camp.name,
    periodo: periodo ?? "hoy",
    registros_periodo: Number(stats.total_periodo),
    agentes_activos: Number(stats.agentes_periodo),
    total_acumulado: Number(stats.total_acumulado),
    top_agentes: agRes.rows.map((r) => ({ nombre: r.encuestador, registros: Number(r.registros) })),
  };
}

// ── Health report ───────────────────────────────────────────────────

async function checkDatabase(): Promise<boolean> {
  try { const r = await pool.query("SELECT 1 AS ok"); return r.rowCount === 1; }
  catch { return false; }
}
async function checkRedis(): Promise<boolean> {
  try { return (await redisClient.ping()) === "PONG"; } catch { return false; }
}
async function checkTegola(env: AppEnv): Promise<boolean> {
  try { const r = await fetchWithRetry(`${env.tegolaBaseUrl}/capabilities`, env); return r.ok; }
  catch { return false; }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function getUptime(): string {
  const secs = os.uptime();
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
  return [d > 0 && `${d}d`, h > 0 && `${h}h`, `${m}m`].filter(Boolean).join(" ");
}

async function buildHealthReport(env: AppEnv): Promise<string> {
  const [dbok, redisok, tegolaok] = await Promise.all([checkDatabase(), checkRedis(), checkTegola(env)]);
  const load1 = os.loadavg()[0] ?? 0;
  const cpuCount = os.cpus().length || 1;
  const totalMem = os.totalmem(), freeMem = os.freemem(), usedMem = totalMem - freeMem;
  let diskLine = "💿 Disco: N/A";
  try {
    const fs = statfsSync("/");
    const bs = Number(fs.bsize), bl = Number(fs.blocks), av = Number(fs.bavail);
    diskLine = `💿 Disco: ${formatBytes((bl - av) * bs)} / ${formatBytes(bl * bs)} (${bl > 0 ? (((bl - av) / bl) * 100).toFixed(0) : 0}%)`;
  } catch { /* ignore */ }
  const icon = (ok: boolean) => ok ? "✅" : "🔴";
  return [
    `🏥 *Status — Goberna*`, `📅 ${new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })}`, `⏱ Uptime: ${getUptime()}`, ``,
    `*Servicios:*`, `${icon(dbok)} PostgreSQL`, `${icon(redisok)} Redis`, `${icon(tegolaok)} Tegola`, ``,
    `*Recursos (${formatBytes(totalMem)} RAM):*`,
    `🖥 CPU: ${Math.min(100, (load1 / cpuCount) * 100).toFixed(1)}% (load ${load1.toFixed(2)})`,
    `💾 RAM: ${formatBytes(usedMem)} / ${formatBytes(totalMem)} (${totalMem > 0 ? ((usedMem / totalMem) * 100).toFixed(0) : 0}%)`,
    diskLine,
  ].join("\n");
}

// ── Message handler ─────────────────────────────────────────────────

async function handleMessage(chatId: number, userText: string) {
  // Show typing indicator
  await tgApi("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

  // Parse intent with Gemini
  const intent = await geminiParseIntent(userText);

  // Execute the right query then format with Gemini
  switch (intent.intent) {
    case "top_agentes": {
      const datos = await queryTopAgentes(intent.depto ?? undefined, intent.periodo);
      const respuesta = await geminiFormatResponse(datos, userText);
      await reply(chatId, respuesta);
      return;
    }
    case "resumen_dia": {
      const datos = await queryResumenDia(intent.periodo);
      const respuesta = await geminiFormatResponse(datos, userText);
      await reply(chatId, respuesta);
      return;
    }
    case "resumen_campana": {
      if (!intent.campana) {
        await reply(chatId, "¿De qué campaña quieres el resumen? Dime el nombre.");
        return;
      }
      const datos = await queryResumenCampana(intent.campana, intent.periodo);
      const respuesta = await geminiFormatResponse(datos, userText);
      await reply(chatId, respuesta);
      return;
    }
    case "health": {
      const report = await buildHealthReport(_env!);
      await reply(chatId, report);
      return;
    }
    case "ayuda": {
      await reply(chatId, [
        `🤖 *Goberna Bot — IA*`,
        ``,
        `Usa \`/g <pregunta>\` para consultar en español natural:`,
        ``,
        `• \`/g mejores agentes de hoy\``,
        `• \`/g top de Lambayeque esta semana\``,
        `• \`/g cómo va la campaña César Vásquez\``,
        `• \`/g resumen del día\``,
        `• \`/g cuántos registros llevamos en cajamarca\``,
        ``,
        `Comandos directos:`,
        `• \`/health\` — estado del servidor`,
        `• \`/ayuda\` — esta lista`,
      ].join("\n"));
      return;
    }
    case "unknown": {
      await reply(chatId, intent.mensaje_directo ?? "No entendí tu pregunta. Intenta de nuevo.");
      return;
    }
    default: {
      await reply(chatId, "No entendí. Escríbeme de otra forma o pregunta '¿qué puedes hacer?'");
      return;
    }
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
  if (!_env?.telegramBotToken) return;

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
        message?: { chat: { id: number }; text?: string };
      }>;
    };

    if (!data.ok || !data.result?.length) return;

    for (const update of data.result) {
      _offset = update.update_id + 1;
      const msg = update.message;
      if (!msg?.text?.trim()) continue;

      const raw = msg.text.trim();
      const lower = raw.toLowerCase();

      // /health y /ayuda sin prefijo /g (comandos de sistema)
      if (lower === "/health" || lower.startsWith("/health@")) {
        handleMessage(msg.chat.id, "/health").catch(() => {});
        continue;
      }
      if (lower === "/ayuda" || lower === "/help" || lower === "/start" || lower.startsWith("/ayuda@")) {
        handleMessage(msg.chat.id, "/ayuda").catch(() => {});
        continue;
      }

      // /g <pregunta> — activa la IA con lenguaje natural
      // Acepta: /g, /G, /g@gobernanotifierbot
      const gMatch = raw.match(/^\/[gG](?:@\w+)?\s+([\s\S]+)/);
      if (gMatch) {
        const pregunta = gMatch[1]!.trim();
        handleMessage(msg.chat.id, pregunta).catch(() => {});
        continue;
      }

      // Todo lo demás → ignorar
    }
  } catch {
    // Network/timeout — retry next cycle
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
  if (!env.telegramBotToken) return;
  _env = env;
  _running = true;
  void pollLoop();
}

export function stopTelegramCommands() {
  _running = false;
}

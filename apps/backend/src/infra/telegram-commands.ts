/**
 * GOBERNA — Telegram Bot con IA (Gemini 2.5 Flash Lite)
 *
 * El bot entiende lenguaje natural y genera queries SQL contra la DB
 * de producción para responder cualquier pregunta operativa.
 *
 * Flujo:
 *   1. Usuario manda /g <pregunta>
 *   2. Gemini genera SQL seguro (SELECT-only) basado en el schema real
 *   3. Backend ejecuta la query
 *   4. Gemini formatea la respuesta para Telegram
 *
 * Comandos:
 *   /g <pregunta>  — cualquier consulta en lenguaje natural
 *   /health        — estado del servidor
 *   /ayuda         — ejemplos de uso
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

const GEMINI_MODEL = "gemini-2.5-flash-lite";

// ── Schema context for Gemini ───────────────────────────────────────

const DB_SCHEMA = `
=== BASE DE DATOS GOBERNA (PostgreSQL 15 + PostGIS) ===
Zona horaria del negocio: America/Lima (UTC-5). SIEMPRE convertir timestamps.

--- TABLAS PRINCIPALES ---

forms (13,671 rows) — Registros de campo capturados por agentes via app mobile.
  id uuid PK, nombre text NOT NULL, telefono text NOT NULL,
  fecha timestamptz NOT NULL, x float8 NOT NULL (UTM easting), y float8 NOT NULL (UTM northing),
  zona text NOT NULL (UTM zone eg '17S','18S'), candidate text, encuestador text NOT NULL (nombre del agente),
  encuestador_id text NOT NULL (user UUID del agente), candidato_preferido text,
  client_id text UNIQUE, comentarios text, campaign_id uuid FK→campaigns,
  form_definition_id uuid, meet_id uuid FK→meets,
  created_at timestamptz NOT NULL, deleted_at timestamptz (soft delete)
  NOTA: x=0,y=0 significa "sin GPS" (capturado desde casa). Excluir con x>100000.
  NOTA: zona '17S' = Lambayeque/Cajamarca/La Libertad. zona '18S' = Lima/centro/sur Peru.

form_submissions (18,376 rows) — Registros nuevos (JSONB). Dual-write desde forms + mobile directo.
  id uuid PK, form_definition_id uuid, campaign_id uuid FK, meet_id uuid,
  submitted_by uuid FK→users (agente), data jsonb NOT NULL (contiene: nombre, telefono, zona,
  candidato_preferido, comentarios, encuestador, departamento, provincia, distrito, ubigeo, lugar_registro),
  lat float8, lng float8 (coordenadas WGS84), client_id text UNIQUE,
  cms_status text ('pending','claimed','hablado','respondieron','archived'),
  cms_claimed_by uuid FK→users (operadora digital), cms_claimed_at timestamptz,
  cms_hablado_at timestamptz, cms_respondieron_at timestamptz,
  cms_operator_notes jsonb, cms_tags text[], ubigeo_distrito text, coord_source text,
  created_at timestamptz, synced_at timestamptz, deleted_at timestamptz

users (3,180 rows) — Todos los usuarios del sistema.
  id uuid PK, full_name text, email text UNIQUE, phone varchar, role text
  (admin|consultor|candidato|brigadista_zonal|agente_campo|agente_digital),
  status text (active|suspended), region varchar, created_at timestamptz

user_campaigns (448 rows) — Asignación de usuarios a campañas con rol específico.
  user_id uuid FK→users, campaign_id uuid FK→campaigns,
  role text (puede diferir del rol global), perm_tierra bool, perm_digital bool,
  region varchar, status text, assigned_at timestamptz

campaigns (16 rows) — Campañas políticas.
  id uuid PK, name text, slug text UNIQUE, partido text, cargo text,
  numero int, status text, foto_url text, config jsonb, created_at timestamptz

meets (163 rows) — Reuniones/jornadas de campo.
  id uuid PK, campaign_id uuid FK, title varchar, status varchar (active|scheduled|completed|cancelled),
  starts_at timestamptz, ends_at timestamptz, location_name varchar, lat float8, lng float8,
  meet_type text, target_forms int, leader_id uuid FK→users, zone_id uuid, created_by uuid

cms_extension_events (10,941 rows) — Eventos WhatsApp de agentes digitales (extensión Chrome).
  id bigint PK, campaign_id uuid, operator_id uuid FK→users (operadora digital),
  contact_id uuid FK→form_submissions, event_type varchar ('message_sent'|'message_received'),
  phone text, matched bool, own_number varchar, created_at timestamptz

cms_twilio_messages (32 rows) — Mensajes WhatsApp via Twilio.
  id uuid PK, campaign_id uuid, contact_id uuid FK→form_submissions,
  sent_by uuid FK→users, direction text ('outbound'|'inbound'), body text,
  status text, twilio_sid text, created_at timestamptz

leads (53 rows) — Leads de campaña digital.
  id uuid PK, nombre varchar, correo varchar, plataforma varchar, created_at timestamptz

zones (160 rows) — Zonas geográficas de campaña.
  id uuid PK, campaign_id uuid FK, name text, center_lat float8, center_lng float8,
  radius_meters int, color text, assigned_to uuid FK→users, metadata jsonb

zone_objectives (objetivos de zona) — Metas por zona.
  id uuid PK, campaign_id uuid, region text, target_forms int, description text

user_objectives — Metas por usuario.
  id uuid PK, user_id uuid FK, campaign_id uuid, target_forms int, notes text

--- RELACIONES CLAVE ---
- forms.encuestador_id = users.id::text (agente de campo que capturó)
- forms.campaign_id = campaigns.id
- form_submissions.submitted_by = users.id (agente)
- form_submissions.cms_claimed_by = users.id (operadora digital)
- user_campaigns.user_id + user_campaigns.campaign_id = asignación
- user_campaigns.role = rol dentro de esa campaña
- cms_extension_events.operator_id = users.id (agente digital)
- Agentes de campo: user_campaigns.role = 'agente_campo'
- Agentes digitales: user_campaigns.role = 'agente_digital'
- Consultores: user_campaigns.role = 'consultor'

--- DEPARTAMENTOS POR UTM ---
forms.zona='17S' con x entre 580000-780000, y entre 9097214-9350000 → Lambayeque
forms.zona='17S' con x entre 650000-825978, y entre 9350000-9985737 → Cajamarca
forms.zona='18S' con x entre 250000-400000, y entre 8630000-8720000 → Lima
form_submissions tiene data->>'departamento', data->>'provincia', data->>'distrito' como alternativa.
`;

const SYSTEM_PROMPT = `Eres el motor de consultas SQL de Goberna, plataforma de operación territorial para campañas políticas en Perú.

SCHEMA DE LA BASE DE DATOS:
${DB_SCHEMA}

Tu trabajo: dado un mensaje en español, generar UNA query SQL segura y responder con JSON.

CONTEXTO CLAVE — CAMPAÑAS vs AGENTES:
- Las campañas llevan nombre de candidatos: "César Vásquez", "Ernesto Bustamante", "Fuerza Popular", etc.
- Cuando el usuario dice "de César Vásquez", "de Ernesto", "de Fuerza Popular" = se refiere a la CAMPAÑA (filtrar por campaigns.name o campaigns.slug).
- Los agentes de campo son quienes CAPTURAN formularios. Sus nombres están en forms.encuestador o users.full_name.
- "reporte de territorio" o "datos de territorio" = formularios capturados (form_submissions o forms).
- "reporte de digital" o "datos de digital" = eventos CMS (cms_extension_events) y contactos WhatsApp.
- Si el usuario dice "de hoy" y hay muy pocos datos, incluye también "ayer" para dar contexto útil. Indica claramente cuáles son de hoy y cuáles de ayer.

REGLAS ESTRICTAS:
1. SOLO genera SELECT. NUNCA INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE.
2. SIEMPRE usa AT TIME ZONE 'America/Lima' para fechas.
3. SIEMPRE excluye deleted_at IS NOT NULL (soft deletes).
4. LIMIT máximo 30 rows.
5. Si piden "hoy", usa: (fs.created_at AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date
6. Si piden "esta semana", usa: created_at >= date_trunc('week', now() AT TIME ZONE 'America/Lima')
7. Si piden "este mes", usa: created_at >= date_trunc('month', now() AT TIME ZONE 'America/Lima')
8. Si piden una fecha específica (ej: "5 de marzo"), usa: (created_at AT TIME ZONE 'America/Lima')::date = '2026-03-05'
9. Cuando busques por nombre de persona (agente), usa ILIKE '%nombre%' para ser flexible.
10. Cuando busques por campaña, usa ILIKE '%nombre%' en campaigns.name O campaigns.slug.
11. Para agentes digitales: filtra por user_campaigns.role = 'agente_digital' o cms_extension_events.
12. Para agentes de campo: filtra por user_campaigns.role = 'agente_campo' o forms.encuestador.
13. Si no puedes generar SQL válido, devuelve intent "chat" con una respuesta directa.
14. Para reportes de territorio, PREFIERE form_submissions (tiene más datos y JSONB con departamento/provincia/distrito).
15. SIEMPRE incluye nombres legibles (JOIN con users, campaigns) — nunca devuelvas solo UUIDs.

QUERIES TÍPICAS QUE DEBES SABER GENERAR:
- "reporte de hoy de César Vásquez" → form_submissions WHERE campaign_id = (SELECT id FROM campaigns WHERE name ILIKE '%cesar%vasquez%') agrupado por agente con COUNT.
- "top agentes de Lambayeque" → form_submissions con data->>'departamento' ILIKE '%lambayeque%' agrupado por submitted_by JOIN users ORDER BY count DESC.
- "cómo va la semana" → resumen con total formularios, agentes activos, meets.
- "busca al usuario 955135501" → users WHERE phone LIKE '%955135501%'.

FORMATO DE RESPUESTA (JSON estricto, sin markdown, sin backticks):
{"intent":"query","sql":"SELECT ...","descripcion":"qué muestra esta query","tipo":"ranking|resumen|detalle|lista"}
{"intent":"chat","respuesta":"texto de respuesta directa si no se necesita SQL"}

El campo "tipo" clasifica la respuesta:
- "ranking": resultados ordenados por cantidad (top agentes, mejores, etc)
- "resumen": cifras agregadas generales (totales, promedios, conteos)
- "detalle": información de una persona o entidad específica
- "lista": listado de items (meets, campañas, zonas, etc)

NUNCA generes otra cosa que no sea ese JSON.`;

// ── Gemini API ──────────────────────────────────────────────────────

type GeminiSqlResult =
  | { intent: "query"; sql: string; descripcion: string; tipo?: string }
  | { intent: "chat"; respuesta: string };

async function geminiGenerateSQL(userMessage: string): Promise<GeminiSqlResult> {
  if (!_env?.geminiApiKey) {
    return { intent: "chat", respuesta: "API key de Gemini no configurada." };
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${_env.geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: userMessage }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { intent: "chat", respuesta: `Error Gemini (${res.status}): ${err.slice(0, 100)}` };
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned) as GeminiSqlResult;

    // Security: block anything that's not a SELECT
    if (parsed.intent === "query") {
      const sqlUpper = parsed.sql.toUpperCase().trim();
      const forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "GRANT", "REVOKE"];
      for (const kw of forbidden) {
        if (sqlUpper.startsWith(kw) || sqlUpper.includes(`; ${kw}`)) {
          return { intent: "chat", respuesta: "No puedo ejecutar ese tipo de consulta." };
        }
      }
      if (!sqlUpper.startsWith("SELECT") && !sqlUpper.startsWith("WITH")) {
        return { intent: "chat", respuesta: "Solo puedo ejecutar consultas de lectura." };
      }
    }

    return parsed;
  } catch (e) {
    return { intent: "chat", respuesta: `Error procesando: ${String(e).slice(0, 100)}` };
  }
}

async function geminiFormatResponse(
  rows: Record<string, unknown>[],
  descripcion: string,
  preguntaOriginal: string,
  rowCount: number,
  tipo?: string,
): Promise<string> {
  if (!_env?.geminiApiKey) return JSON.stringify(rows, null, 2);

  const datosStr = JSON.stringify(rows.slice(0, 30), null, 2);

  const templateGuide = tipo === "ranking"
    ? `FORMATO RANKING — usa este template exacto:

🏆 *[Título descriptivo]*
📅 [Fecha o período]

1. *[Nombre]* ▸ [cantidad] registros
2. *[Nombre]* ▸ [cantidad] registros
3. *[Nombre]* ▸ [cantidad] registros
...

📊 *Total:* [N] registros | [N] agentes activos

Reglas: numerar del 1 al N. Una línea por persona. Alinear con ▸. Total al final.`

    : tipo === "resumen"
    ? `FORMATO RESUMEN — usa este template exacto:

📊 *Resumen — [Campaña/Contexto]*
📅 [Fecha o período]

📝 Formularios: *[N]* hoy | *[N]* esta semana
👥 Agentes activos: *[N]* de [N total]
📍 Meets: *[N]* activos | *[N]* completados
🏆 Mejor agente: *[Nombre]* ([N] registros)
⚠️ Sin actividad: [nombres separados por coma]

Reglas: una línea por métrica. Negrita en números. Incluir lo que haya disponible en los datos.`

    : tipo === "detalle"
    ? `FORMATO DETALLE — usa este template exacto:

👤 *[Nombre completo]*
📞 [Teléfono]
📧 [Email]
🏷️ Rol: [rol]
📋 Campaña: [nombre]
📝 Registros: *[N]* total | *[N]* hoy
📅 Último registro: [fecha]

Reglas: una línea por dato. Solo mostrar campos que existan en el JSON. Negrita en nombre y números clave.`

    : tipo === "lista"
    ? `FORMATO LISTA — usa este template exacto:

📋 *[Título descriptivo]*
📅 [Fecha o período]

1. 📍 *[Nombre/Título del item]*
   [Detalle línea 1] | [Detalle línea 2]

2. 📍 *[Nombre/Título del item]*
   [Detalle línea 1] | [Detalle línea 2]

📊 *Total:* [N] items

Reglas: numerar. Nombre en negrita. Detalles debajo con indent. Total al final.`

    : `FORMATO GENERAL — respuesta clara y estructurada:
- Una línea de título con emoji y *negrita*
- Datos organizados con emojis de guía (📝👥📍📊🏆⚠️📅)
- Números siempre en *negrita*
- Total o conclusión al final`;

  const prompt = `Eres el bot de reportes de Goberna para Telegram. El usuario preguntó: "${preguntaOriginal}"
La query buscó: ${descripcion}
Se encontraron ${rowCount} resultados.

Datos (JSON):
${datosStr}

${templateGuide}

REGLAS OBLIGATORIAS:
- Usa EXACTAMENTE el formato Markdown de Telegram: *negrita* (NO **negrita**)
- NO uses formato de tabla ni code blocks
- NO inventes datos que no estén en el JSON
- Si un campo es null o vacío, omítelo
- Máximo 30 líneas
- Sé directo, como un reporte ejecutivo para un jefe de campaña
- Si no hay datos, responde: "📭 No hay datos de [contexto] para [período]."
- Los nombres propios siempre con mayúscula inicial`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${_env.geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!res.ok) return `📊 ${descripcion}\n\n${datosStr}`;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? datosStr;
  } catch {
    return `📊 ${descripcion}\n\n${datosStr}`;
  }
}

// ── Message handler ─────────────────────────────────────────────────

async function handleMessage(chatId: number, userText: string) {
  await tgApi("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

  // Special commands
  if (userText === "/health") {
    await reply(chatId, await buildHealthReport(_env!));
    return;
  }
  if (userText === "/ayuda") {
    await reply(chatId, buildAyuda());
    return;
  }

  // Generate SQL via Gemini
  const result = await geminiGenerateSQL(userText);

  if (result.intent === "chat") {
    await reply(chatId, result.respuesta);
    return;
  }

  // Execute SQL
  try {
    const queryResult = await pool.query(result.sql);
    const rows = queryResult.rows as Record<string, unknown>[];
    const rowCount = queryResult.rowCount ?? 0;

    if (rows.length === 0) {
      await reply(chatId, `📭 No se encontraron resultados.\n_${result.descripcion}_`);
      return;
    }

    // Format with Gemini
    const respuesta = await geminiFormatResponse(rows, result.descripcion, userText, rowCount, result.tipo);
    await reply(chatId, respuesta);
  } catch (e) {
    const errMsg = String(e).slice(0, 200);
    // Retry: tell Gemini about the error and ask for a fixed query
    const retry = await geminiGenerateSQL(
      `${userText}\n\nNOTA: La query anterior falló con error: ${errMsg}. Corrige el SQL.`,
    );

    if (retry.intent === "query") {
      try {
        const retryResult = await pool.query(retry.sql);
        const rows = retryResult.rows as Record<string, unknown>[];
        if (rows.length === 0) {
          await reply(chatId, `📭 No se encontraron resultados.\n_${retry.descripcion}_`);
          return;
        }
        const respuesta = await geminiFormatResponse(rows, retry.descripcion, userText, retryResult.rowCount ?? 0, retry.tipo);
        await reply(chatId, respuesta);
        return;
      } catch {
        // Second failure — give up
      }
    }

    await reply(chatId, `❌ No pude completar la consulta. Intenta reformular la pregunta.`);
  }
}

// ── Health & Ayuda ──────────────────────────────────────────────────

function buildAyuda(): string {
  return [
    `🤖 *Goberna Bot — IA*`,
    ``,
    `Escribe \`/g\` seguido de tu pregunta:`,
    ``,
    `📊 *Reportes generales:*`,
    `• \`/g resumen de hoy\``,
    `• \`/g cuántos registros esta semana\``,
    `• \`/g total de registros por campaña este mes\``,
    ``,
    `🏆 *Agentes de campo:*`,
    `• \`/g top agentes de hoy en Lambayeque\``,
    `• \`/g cuántos registros lleva Katterine Perez\``,
    `• \`/g agentes de la campaña César Vásquez\``,
    `• \`/g registros del 5 de marzo en Cajamarca\``,
    ``,
    `📱 *Agentes digitales (CMS):*`,
    `• \`/g métricas de agentes digitales hoy\``,
    `• \`/g cuántos mensajes WA se enviaron esta semana\``,
    `• \`/g contactos en estado hablado de César Vásquez\``,
    ``,
    `📋 *Campañas y equipos:*`,
    `• \`/g miembros de la campaña Perú Primero\``,
    `• \`/g reuniones activas\``,
    `• \`/g leads de esta semana\``,
    ``,
    `🔧 *Sistema:*`,
    `• \`/health\` — estado del servidor`,
  ].join("\n");
}

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
  const s = os.uptime();
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return [d > 0 && `${d}d`, h > 0 && `${h}h`, `${m}m`].filter(Boolean).join(" ");
}

async function buildHealthReport(env: AppEnv): Promise<string> {
  const [dbok, redisok, tegolaok] = await Promise.all([checkDatabase(), checkRedis(), checkTegola(env)]);
  const load1 = os.loadavg()[0] ?? 0;
  const cpuCount = os.cpus().length || 1;
  const totalMem = os.totalmem(), usedMem = totalMem - os.freemem();
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
    `🖥 CPU: ${Math.min(100, (load1 / cpuCount) * 100).toFixed(1)}%`,
    `💾 RAM: ${formatBytes(usedMem)} / ${formatBytes(totalMem)} (${((usedMem / totalMem) * 100).toFixed(0)}%)`,
    diskLine,
  ].join("\n");
}

// ── Telegram API ────────────────────────────────────────────────────

function tgApi(method: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${_env!.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function reply(chatId: number, text: string) {
  // Telegram has 4096 char limit — split if needed
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= 4000) {
      chunks.push(remaining);
      break;
    }
    // Find last newline before 4000
    const cutoff = remaining.lastIndexOf("\n", 4000);
    const cut = cutoff > 200 ? cutoff : 4000;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }

  for (const chunk of chunks) {
    await tgApi("sendMessage", { chat_id: chatId, text: chunk, parse_mode: "Markdown" }).catch(
      async () => {
        // Markdown parse error — retry without parse_mode
        await tgApi("sendMessage", { chat_id: chatId, text: chunk }).catch(() => {});
      },
    );
  }
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

      // /health — direct
      if (lower === "/health" || lower.startsWith("/health@")) {
        handleMessage(msg.chat.id, "/health").catch(() => {});
        continue;
      }

      // /ayuda, /help, /start — direct
      if (lower === "/ayuda" || lower === "/help" || lower === "/start" || lower.startsWith("/ayuda@")) {
        handleMessage(msg.chat.id, "/ayuda").catch(() => {});
        continue;
      }

      // /g <pregunta> — IA
      const gMatch = raw.match(/^\/[gG](?:@\w+)?\s+([\s\S]+)/);
      if (gMatch) {
        handleMessage(msg.chat.id, gMatch[1]!.trim()).catch(() => {});
        continue;
      }

      // Everything else → ignore
    }
  } catch {
    // Network/timeout — retry
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

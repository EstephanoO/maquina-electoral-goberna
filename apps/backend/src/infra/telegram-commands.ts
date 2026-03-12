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

// ── Estado conversacional por chat ──────────────────────────────────
// Recuerda la última campaña elegida y el contexto pendiente
type ChatState = {
  pendingCommand?: string;     // comando esperando respuesta (ej: "/meta")
  lastCampaignSlug?: string;   // última campaña usada
  ts: number;                  // timestamp para expirar
};
const _chatState = new Map<number, ChatState>();
const CHAT_STATE_TTL = 5 * 60 * 1000; // 5 minutos

function getChatState(chatId: number): ChatState | undefined {
  const s = _chatState.get(chatId);
  if (s && Date.now() - s.ts > CHAT_STATE_TTL) { _chatState.delete(chatId); return undefined; }
  return s;
}
function setChatState(chatId: number, partial: Partial<ChatState>) {
  const existing = getChatState(chatId);
  _chatState.set(chatId, { ...existing, ...partial, ts: Date.now() });
}
function clearPending(chatId: number) {
  const s = getChatState(chatId);
  if (s) { delete s.pendingCommand; _chatState.set(chatId, { ...s, ts: Date.now() }); }
}

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
- Cuando el usuario dice "de César Vásquez", "de Ernesto", "de Fuerza Popular" = se refiere a la CAMPAÑA (filtrar por campaigns.slug).
- Cuando el usuario dice un nombre que NO es de campaña (ej: "Mónica Sánchez", "Juan García", "Elmer Alaya") = se refiere a un AGENTE (filtrar por users.full_name).
- Para distinguir: si el nombre coincide con un slug de campaña conocido → es campaña. Si no → es agente de campo (buscar en users.full_name).
- "reporte de territorio" o "datos de territorio" = formularios capturados (form_submissions).
- "reporte de digital" o "datos de digital" = eventos CMS (cms_extension_events) y contactos WhatsApp.
- "actividad del día", "cómo fue su día", "a qué horas subió" = timeline por hora (agrupar por date_trunc('hour', created_at)).
- Si el usuario dice "de hoy" y hay muy pocos datos, incluye también "ayer" para dar contexto. Indica claramente cuáles son de hoy y cuáles de ayer.

REGLAS ESTRICTAS:
1. SOLO genera SELECT. NUNCA INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE.
2. SIEMPRE usa AT TIME ZONE 'America/Lima' para fechas.
3. SIEMPRE excluye deleted_at IS NOT NULL (soft deletes).
4. LIMIT máximo 30 rows.
5. Si piden "hoy", usa: (fs.created_at AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date
6. Si piden "esta semana", usa: created_at >= date_trunc('week', now() AT TIME ZONE 'America/Lima')
7. Si piden "este mes", usa: created_at >= date_trunc('month', now() AT TIME ZONE 'America/Lima')
8. Si piden una fecha específica (ej: "5 de marzo"), usa: (created_at AT TIME ZONE 'America/Lima')::date = '2026-03-05'
9. CRITICO — BÚSQUEDA POR NOMBRE: Los nombres en Perú tienen tildes (César, Vásquez, María, etc). SIEMPRE usa unaccent() para comparar: WHERE unaccent(campo) ILIKE unaccent('%texto%'). NUNCA uses ILIKE sin unaccent.
10. Para buscar campaña, PREFIERE buscar por slug (sin tildes ni espacios): campaigns.slug ILIKE '%cesar-vasquez%'. Alternativa: unaccent(campaigns.name) ILIKE unaccent('%cesar vasquez%').
11. Para agentes digitales: filtra por user_campaigns.role = 'agente_digital' o cms_extension_events.
12. Para agentes de campo: filtra por user_campaigns.role = 'agente_campo' o forms.encuestador.
13. Si no puedes generar SQL válido o la pregunta es ambigua, devuelve intent "chat" con una PREGUNTA de clarificación. Ejemplos:
   - "¿Te refieres a la campaña César Vásquez o a un agente con ese nombre?"
   - "¿Quieres ver los datos de hoy, esta semana, o un rango específico?"
   - "¿Qué campaña te interesa? Tenemos: César Vásquez, Ernesto Bustamante, Fuerza Popular..."
   NUNCA respondas solo "no pude procesar". Siempre sugiere algo útil o pregunta para clarificar.
14. Para reportes de territorio, PREFIERE form_submissions (tiene más datos y JSONB con departamento/provincia/distrito).
15. SIEMPRE incluye nombres legibles (JOIN con users, campaigns) — nunca devuelvas solo UUIDs.
16. Para obtener el nombre del agente, usa: COALESCE(u.full_name, fs.data->>'encuestador') donde u viene de LEFT JOIN users u ON fs.submitted_by = u.id.

CAMPAÑAS ACTIVAS Y SUS SLUGS (usar slug para buscar):
cesar-vasquez, ernesto-bustamante, fernando-rospigliosi, fuerza-popular, ahora-nacion, peru-primero, edwards-infante, guillermo-aliaga, rosangella-barbaran, rocio-porras, renovacion-popular, yessenia-lozano, pais-para-todos, donald-trump, joe-biden

QUERIES TÍPICAS QUE DEBES SABER GENERAR:

1. "reporte de hoy de César Vásquez" (por campaña) →
  SELECT COALESCE(u.full_name, fs.data->>'encuestador') as agente, COUNT(*) as registros
  FROM form_submissions fs JOIN campaigns c ON fs.campaign_id = c.id
  LEFT JOIN users u ON fs.submitted_by = u.id
  WHERE c.slug = 'cesar-vasquez'
  AND (fs.created_at AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date
  AND fs.deleted_at IS NULL
  GROUP BY agente ORDER BY registros DESC LIMIT 30

2. "actividad de Mónica Sánchez el 11 de marzo" (por agente, timeline por hora) →
  SELECT to_char(date_trunc('hour', fs.created_at AT TIME ZONE 'America/Lima'), 'HH12:MI AM') as hora,
    COUNT(*) as registros,
    MIN(to_char(fs.created_at AT TIME ZONE 'America/Lima', 'HH12:MI AM')) as primer_registro,
    MAX(to_char(fs.created_at AT TIME ZONE 'America/Lima', 'HH12:MI AM')) as ultimo_registro
  FROM form_submissions fs JOIN users u ON fs.submitted_by = u.id
  WHERE unaccent(u.full_name) ILIKE unaccent('%monica sanchez%')
  AND (fs.created_at AT TIME ZONE 'America/Lima')::date = '2026-03-11'
  AND fs.deleted_at IS NULL
  GROUP BY date_trunc('hour', fs.created_at AT TIME ZONE 'America/Lima')
  ORDER BY hora

3. "top agentes de Lambayeque" → form_submissions con data->>'departamento' ILIKE '%lambayeque%', agrupar por agente, ORDER BY count DESC.

4. "cómo va la semana" → total formularios + agentes activos + meets activos.

5. "busca al usuario 955135501" → users WHERE phone LIKE '%955135501%'.

6. "registro de actividad del día de X" → usar el patrón del ejemplo 2 (timeline por hora) con nombre de agente.

FORMATO DE RESPUESTA (JSON estricto, sin markdown, sin backticks):
{"intent":"query","sql":"SELECT ...","descripcion":"qué muestra esta query","tipo":"ranking|resumen|detalle|lista"}
{"intent":"chat","respuesta":"texto de respuesta directa si no se necesita SQL"}

El campo "tipo" clasifica la respuesta:
- "ranking": resultados ordenados por cantidad (top agentes, mejores, etc)
- "resumen": cifras agregadas generales (totales, promedios, conteos)
- "detalle": información de una persona o entidad específica
- "lista": listado de items (meets, campañas, zonas, etc)
- "timeline": actividad cronológica por hora de un agente en un día

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
          system_instruction: { parts: [{ text: SYSTEM_PROMPT + "\n\n" + COMPARATIVE_PROMPT_ADDON }] },
          contents: [{ parts: [{ text: userMessage }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
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

    let parsed: GeminiSqlResult;
    try {
      parsed = JSON.parse(cleaned) as GeminiSqlResult;
    } catch {
      // Try to repair truncated JSON — extract SQL if present
      const sqlMatch = cleaned.match(/"sql"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
      const descMatch = cleaned.match(/"descripcion"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
      const tipoMatch = cleaned.match(/"tipo"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
      if (sqlMatch?.[1]) {
        parsed = {
          intent: "query",
          sql: sqlMatch[1].replace(/\\"/g, '"').replace(/\\n/g, " "),
          descripcion: descMatch?.[1] ?? "Consulta generada",
          tipo: tipoMatch?.[1] as string | undefined,
        };
      } else {
        // Try to extract chat response
        const chatMatch = cleaned.match(/"respuesta"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
        if (chatMatch?.[1]) {
          return { intent: "chat", respuesta: chatMatch[1] };
        }
        return { intent: "chat", respuesta: "No pude procesar la consulta. Intenta reformularla." };
      }
    }

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

  const templateGuide = tipo === "timeline"
    ? `FORMATO TIMELINE — actividad de un agente en el día:

📋 *Actividad de [Nombre del agente]*
📅 [Fecha]

🕐 [Hora] — *[N]* registros  _(primer: HH:MM, último: HH:MM)_
🕑 [Hora] — *[N]* registros  _(primer: HH:MM, último: HH:MM)_
🕒 [Hora] — *[N]* registros  _(primer: HH:MM, último: HH:MM)_
...

📊 *Total del día:* [N] registros
⏱ *Actividad:* [hora inicio] — [hora fin]
🔥 *Hora más productiva:* [Hora] con [N] registros

Reglas: una línea por hora activa. Si hay registros a las 00:00, indica entre paréntesis "(sync nocturno — probablemente cargados offline)". Negrita en números.`

    : tipo === "ranking"
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

// ── Queries rápidas (sin Gemini) ────────────────────────────────────

async function buildDiarioReport(campaignSlug?: string): Promise<string> {
  const campFilter = campaignSlug
    ? `AND c.slug = '${campaignSlug.replace(/'/g, "''")}'`
    : "";
  const campLabel = campaignSlug ?? "todas las campañas";

  const { rows: hoy } = await pool.query(`
    SELECT
      c.name as campana,
      COUNT(*) as registros_hoy,
      COUNT(DISTINCT fs.submitted_by) as agentes_hoy
    FROM form_submissions fs
    JOIN campaigns c ON fs.campaign_id = c.id
    WHERE (fs.created_at AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date
    AND fs.deleted_at IS NULL ${campFilter}
    GROUP BY c.name ORDER BY registros_hoy DESC
  `);

  const { rows: ayer } = await pool.query(`
    SELECT
      c.name as campana,
      COUNT(*) as registros_ayer
    FROM form_submissions fs
    JOIN campaigns c ON fs.campaign_id = c.id
    WHERE (fs.created_at AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date - 1
    AND fs.deleted_at IS NULL ${campFilter}
    GROUP BY c.name
  `);

  const { rows: prom7 } = await pool.query(`
    SELECT
      c.name as campana,
      ROUND(COUNT(*)::numeric / 7, 0) as prom_diario
    FROM form_submissions fs
    JOIN campaigns c ON fs.campaign_id = c.id
    WHERE fs.created_at >= now() - interval '7 days'
    AND (fs.created_at AT TIME ZONE 'America/Lima')::date < (now() AT TIME ZONE 'America/Lima')::date
    AND fs.deleted_at IS NULL ${campFilter}
    GROUP BY c.name
  `);

  const { rows: top } = await pool.query(`
    SELECT
      COALESCE(u.full_name, fs.data->>'encuestador') as agente,
      c.name as campana,
      COUNT(*) as registros
    FROM form_submissions fs
    JOIN campaigns c ON fs.campaign_id = c.id
    LEFT JOIN users u ON fs.submitted_by = u.id
    WHERE (fs.created_at AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date
    AND fs.deleted_at IS NULL ${campFilter}
    GROUP BY agente, c.name ORDER BY registros DESC LIMIT 5
  `);

  const fecha = new Date().toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long" });
  const totalHoy = (hoy as Record<string,unknown>[]).reduce((s, r) => s + Number(r.registros_hoy), 0);
  const totalAyer = (ayer as Record<string,unknown>[]).reduce((s, r) => s + Number(r.registros_ayer), 0);
  const delta = totalHoy - totalAyer;
  const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
  const deltaEmoji = delta > 0 ? "📈" : delta < 0 ? "📉" : "➡️";

  const lines: string[] = [
    `📊 *Reporte Diario — ${fecha}*`,
    `📋 Campaña: ${campLabel}`,
    ``,
    `📝 *Registros hoy:* ${totalHoy}  ${deltaEmoji} ${deltaStr} vs ayer (${totalAyer})`,
    ``,
  ];

  if ((hoy as Record<string,unknown>[]).length > 1) {
    lines.push(`*Por campaña:*`);
    for (const r of hoy as Record<string,unknown>[]) {
      const ayerRow = (ayer as Record<string,unknown>[]).find(a => a.campana === r.campana);
      const promRow = (prom7 as Record<string,unknown>[]).find(p => p.campana === r.campana);
      const d = Number(r.registros_hoy) - Number(ayerRow?.registros_ayer ?? 0);
      const dStr = d >= 0 ? `+${d}` : `${d}`;
      const prom = promRow?.prom_diario ?? "—";
      lines.push(`• *${r.campana}*: ${r.registros_hoy} (${dStr} vs ayer | prom 7d: ${prom})`);
    }
    lines.push(``);
  } else if ((hoy as Record<string,unknown>[]).length === 1) {
    const promRow = (prom7 as Record<string,unknown>[]).find(p => p.campana === (hoy as Record<string,unknown>[])[0]!.campana);
    lines.push(`👥 *Agentes activos hoy:* ${(hoy as Record<string,unknown>[])[0]!.agentes_hoy}`);
    lines.push(`📉 *Promedio últimos 7 días:* ${promRow?.prom_diario ?? "—"} reg/día`);
    lines.push(``);
  }

  if ((top as Record<string,unknown>[]).length > 0) {
    lines.push(`🏆 *Top agentes hoy:*`);
    (top as Record<string,unknown>[]).forEach((r, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      lines.push(`${medal} *${r.agente}* ▸ ${r.registros} registros`);
    });
  }

  if (totalHoy === 0) {
    lines.push(`⚠️ Sin actividad registrada hoy todavía.`);
    if (totalAyer > 0) lines.push(`_Ayer: ${totalAyer} registros._`);
  }

  // Si la campaña tiene meta, agregar progreso
  if (campaignSlug) {
    const meta = await calcularMeta(campaignSlug);
    if (meta) {
      lines.push(``);
      lines.push(`🎯 *Meta:* ${buildProgressBar(meta.pct_progreso)} *${meta.pct_progreso}%* (${meta.datos_dedup.toLocaleString()}/${meta.meta_total.toLocaleString()})`);
      lines.push(`⚡ *Cuota diaria:* ${meta.meta_diaria_agente} reg/agente | 📅 ${meta.dias_restantes}d restantes`);
    }
  }

  return lines.join("\n");
}

async function buildSemanaReport(campaignSlug?: string): Promise<string> {
  const campFilter = campaignSlug
    ? `AND c.slug = '${campaignSlug.replace(/'/g, "''")}'`
    : "";
  const campLabel = campaignSlug ?? "todas las campañas";

  const { rows: dias } = await pool.query(`
    SELECT
      (fs.created_at AT TIME ZONE 'America/Lima')::date as dia,
      COUNT(*) as registros,
      COUNT(DISTINCT fs.submitted_by) as agentes
    FROM form_submissions fs
    JOIN campaigns c ON fs.campaign_id = c.id
    WHERE fs.created_at >= date_trunc('week', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima'
    AND fs.deleted_at IS NULL ${campFilter}
    GROUP BY dia ORDER BY dia
  `);

  const { rows: top } = await pool.query(`
    SELECT
      COALESCE(u.full_name, fs.data->>'encuestador') as agente,
      COUNT(*) as registros
    FROM form_submissions fs
    JOIN campaigns c ON fs.campaign_id = c.id
    LEFT JOIN users u ON fs.submitted_by = u.id
    WHERE fs.created_at >= date_trunc('week', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima'
    AND fs.deleted_at IS NULL ${campFilter}
    GROUP BY agente ORDER BY registros DESC LIMIT 5
  `);

  const { rows: semanaAnterior } = await pool.query(`
    SELECT COUNT(*) as total
    FROM form_submissions fs
    JOIN campaigns c ON fs.campaign_id = c.id
    WHERE fs.created_at >= date_trunc('week', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima' - interval '7 days'
    AND fs.created_at < date_trunc('week', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima'
    AND fs.deleted_at IS NULL ${campFilter}
  `);

  const totalSemana = (dias as Record<string,unknown>[]).reduce((s, r) => s + Number(r.registros), 0);
  const totalSemAnt = Number((semanaAnterior as Record<string,unknown>[])[0]?.total ?? 0);
  const delta = totalSemana - totalSemAnt;
  const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
  const deltaEmoji = delta > 0 ? "📈" : delta < 0 ? "📉" : "➡️";

  const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const lines: string[] = [
    `📊 *Resumen Semanal*`,
    `📋 ${campLabel}`,
    ``,
    `📝 *Total semana:* ${totalSemana}  ${deltaEmoji} ${deltaStr} vs semana anterior (${totalSemAnt})`,
    ``,
    `*Actividad por día:*`,
  ];

  for (const r of dias as Record<string,unknown>[]) {
    const d = new Date(r.dia as string);
    const nombre = diasSemana[d.getUTCDay()] ?? "";
    const bar = "█".repeat(Math.min(10, Math.round(Number(r.registros) / Math.max(1, totalSemana / 10 / (dias as Record<string,unknown>[]).length))));
    lines.push(`${nombre}: *${r.registros}* reg | ${r.agentes} agentes ${bar}`);
  }

  if ((top as Record<string,unknown>[]).length > 0) {
    lines.push(``);
    lines.push(`🏆 *Top agentes de la semana:*`);
    (top as Record<string,unknown>[]).forEach((r, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      lines.push(`${medal} *${r.agente}* ▸ ${r.registros}`);
    });
  }

  return lines.join("\n");
}

async function buildInactivosReport(campaignSlug?: string): Promise<string> {
  const campFilter = campaignSlug
    ? `AND c.slug = '${campaignSlug.replace(/'/g, "''")}'`
    : "";

  const { rows } = await pool.query(`
    SELECT
      u.full_name as agente,
      c.name as campana,
      MAX((fs.created_at AT TIME ZONE 'America/Lima')::date) as ultimo_dia,
      (now() AT TIME ZONE 'America/Lima')::date - MAX((fs.created_at AT TIME ZONE 'America/Lima')::date) as dias_sin_actividad,
      COUNT(*) as total_historico
    FROM form_submissions fs
    JOIN users u ON fs.submitted_by = u.id
    JOIN campaigns c ON fs.campaign_id = c.id
    WHERE fs.deleted_at IS NULL ${campFilter}
    GROUP BY u.full_name, c.name
    HAVING MAX((fs.created_at AT TIME ZONE 'America/Lima')::date) < (now() AT TIME ZONE 'America/Lima')::date - interval '2 days'
    ORDER BY dias_sin_actividad DESC LIMIT 20
  `);

  if ((rows as Record<string,unknown>[]).length === 0) {
    return `✅ *Sin inactivos*\nTodos los agentes tienen actividad en los últimos 2 días.`;
  }

  const fecha = new Date().toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long" });
  const lines: string[] = [
    `⚠️ *Agentes sin actividad — ${fecha}*`,
    ``,
  ];

  for (const r of rows as Record<string,unknown>[]) {
    const dias = Number(r.dias_sin_actividad);
    const emoji = dias >= 7 ? "🔴" : dias >= 4 ? "🟠" : "🟡";
    lines.push(`${emoji} *${r.agente}* — ${dias}d sin actividad`);
    lines.push(`   Último: ${r.ultimo_dia} | Total histórico: ${r.total_historico}`);
  }

  lines.push(``);
  lines.push(`📊 *Total inactivos:* ${(rows as Record<string,unknown>[]).length} agentes`);

  return lines.join("\n");
}

async function buildTopReport(campaignSlug?: string): Promise<string> {
  const campFilter = campaignSlug
    ? `AND c.slug = '${campaignSlug.replace(/'/g, "''")}'`
    : "";
  const campLabel = campaignSlug ?? "todas las campañas";
  const fecha = new Date().toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long" });

  const { rows } = await pool.query(`
    SELECT
      COALESCE(u.full_name, fs.data->>'encuestador') as agente,
      COUNT(*) as hoy,
      (SELECT COUNT(*) FROM form_submissions fs2
       WHERE fs2.submitted_by = fs.submitted_by
       AND (fs2.created_at AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date - 1
       AND fs2.deleted_at IS NULL) as ayer
    FROM form_submissions fs
    JOIN campaigns c ON fs.campaign_id = c.id
    LEFT JOIN users u ON fs.submitted_by = u.id
    WHERE (fs.created_at AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date
    AND fs.deleted_at IS NULL ${campFilter}
    GROUP BY agente, fs.submitted_by ORDER BY hoy DESC LIMIT 15
  `);

  if ((rows as Record<string,unknown>[]).length === 0) {
    return `📭 Sin registros hoy en ${campLabel}.\n_Puede que el día recién esté comenzando._`;
  }

  const totalHoy = (rows as Record<string,unknown>[]).reduce((s, r) => s + Number(r.hoy), 0);
  const lines: string[] = [
    `🏆 *Top Agentes — ${fecha}*`,
    `📋 ${campLabel}`,
    ``,
  ];

  (rows as Record<string,unknown>[]).forEach((r, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    const ayer = Number(r.ayer);
    const hoy = Number(r.hoy);
    const d = hoy - ayer;
    const dStr = ayer > 0 ? ` (${d >= 0 ? "+" : ""}${d} vs ayer)` : "";
    lines.push(`${medal} *${r.agente}* ▸ ${hoy} registros${dStr}`);
  });

  lines.push(``);
  lines.push(`📊 *Total hoy:* ${totalHoy} registros | ${(rows as Record<string,unknown>[]).length} agentes activos`);

  return lines.join("\n");
}

// ── Selector de campaña interactivo ──────────────────────────────────

async function buildCampaignPicker(chatId: number, command: string): Promise<string> {
  const { rows } = await pool.query(`
    SELECT c.name, c.slug, COUNT(fs.id) as registros,
      CASE WHEN config->>'meta_total' IS NOT NULL THEN '🎯' ELSE '' END as tiene_meta
    FROM campaigns c
    LEFT JOIN form_submissions fs ON fs.campaign_id = c.id
      AND fs.deleted_at IS NULL
      AND fs.created_at >= now() - interval '7 days'
    WHERE c.status = 'active'
    GROUP BY c.id, c.name, c.slug, c.config
    HAVING COUNT(fs.id) > 0
    ORDER BY COUNT(fs.id) DESC
  `);

  setChatState(chatId, { pendingCommand: command });

  const lines: string[] = [
    `📋 *¿De cuál campaña?*`,
    ``,
  ];

  (rows as Record<string,unknown>[]).forEach((r, i) => {
    lines.push(`${i + 1}. ${r.tiene_meta}*${r.name}* — ${r.registros} reg (7d)`);
  });

  lines.push(``);
  lines.push(`_Escribe el nombre o número de la campaña._`);

  return lines.join("\n");
}

function resolveCampaignFromPickerInput(input: string): string | undefined {
  const trimmed = input.trim();
  // Si es un número, intentar matchear con la posición
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1) {
    // Se resuelve en handleMessage con la lista real
    return undefined; // necesita la lista
  }
  return slugFromInput(trimmed);
}

// ── Meta dinámica por campaña ────────────────────────────────────────

type MetaCalc = {
  campana: string;
  slug: string;
  meta_total: number;
  election_date: string;
  buffer_pct: number;
  datos_actuales: number;
  datos_dedup: number;
  restante: number;
  dias_restantes: number;
  agentes_campo: number;
  agentes_campo_total: number;
  meta_diaria_agente: number;
  pct_progreso: number;
};

async function calcularMeta(campaignSlug: string): Promise<MetaCalc | null> {
  const { rows: camp } = await pool.query(`
    SELECT id, name, slug,
      (config->>'meta_total')::int as meta_total,
      config->>'election_date' as election_date,
      COALESCE((config->>'buffer_pct')::int, 25) as buffer_pct
    FROM campaigns
    WHERE slug = $1 AND config->>'meta_total' IS NOT NULL
  `, [campaignSlug]);

  if (camp.length === 0) return null;
  const c = camp[0] as Record<string, unknown>;

  const { rows: datos } = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT CASE WHEN COALESCE(data->>'telefono','') != '' THEN data->>'telefono' END) as dedup
    FROM form_submissions
    WHERE campaign_id = $1 AND deleted_at IS NULL
  `, [c.id]);

  const { rows: agentesTotales } = await pool.query(`
    SELECT COUNT(DISTINCT user_id) as total
    FROM user_campaigns
    WHERE campaign_id = $1 AND role = 'agente_campo'
  `, [c.id]);

  const { rows: agentesActivos } = await pool.query(`
    SELECT COUNT(DISTINCT submitted_by) as activos
    FROM form_submissions
    WHERE campaign_id = $1 AND deleted_at IS NULL
    AND created_at >= now() - interval '7 days'
  `, [c.id]);

  const metaTotal = Number(c.meta_total);
  const bufferPct = Number(c.buffer_pct);
  const datosActuales = Number((datos[0] as Record<string,unknown>).total);
  const datosDedup = Number((datos[0] as Record<string,unknown>).dedup);
  const agentesCampoTotal = Math.max(1, Number((agentesTotales[0] as Record<string,unknown>).total));
  const agentesCampo = Math.max(1, Number((agentesActivos[0] as Record<string,unknown>).activos));

  const electionDate = c.election_date as string;
  const hoyLima = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
  const eleccion = new Date(electionDate + "T00:00:00");
  const diasRestantes = Math.max(1, Math.ceil((eleccion.getTime() - hoyLima.getTime()) / 86400000));

  const restante = Math.max(0, metaTotal - datosDedup);
  const metaDiariaAgente = Math.ceil((restante / diasRestantes / agentesCampo) * (1 + bufferPct / 100));
  const pctProgreso = Math.round((datosDedup / metaTotal) * 100);

  return {
    campana: c.name as string,
    slug: c.slug as string,
    meta_total: metaTotal,
    election_date: electionDate,
    buffer_pct: bufferPct,
    datos_actuales: datosActuales,
    datos_dedup: datosDedup,
    restante,
    dias_restantes: diasRestantes,
    agentes_campo: agentesCampo,
    agentes_campo_total: agentesCampoTotal,
    meta_diaria_agente: metaDiariaAgente,
    pct_progreso: pctProgreso,
  };
}

function buildProgressBar(pct: number, width = 10): string {
  const filled = Math.min(width, Math.round((pct / 100) * width));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

async function buildMetaReport(campaignSlug: string): Promise<string> {
  const meta = await calcularMeta(campaignSlug);
  if (!meta) {
    return `📭 No hay meta configurada para esa campaña.\n_Configura meta\\_total, election\\_date y buffer\\_pct en campaigns.config._`;
  }

  const eleccionStr = new Date(meta.election_date + "T00:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });

  // Top agentes de hoy vs meta diaria
  const { rows: topHoy } = await pool.query(`
    SELECT
      COALESCE(u.full_name, fs.data->>'encuestador') as agente,
      COUNT(*) as hoy
    FROM form_submissions fs
    LEFT JOIN users u ON fs.submitted_by = u.id
    WHERE fs.campaign_id = (SELECT id FROM campaigns WHERE slug = $1)
    AND (fs.created_at AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date
    AND fs.deleted_at IS NULL
    GROUP BY agente ORDER BY hoy DESC LIMIT 10
  `, [campaignSlug]);

  const lines: string[] = [
    `🎯 *Meta — ${meta.campana}*`,
    ``,
    `📊 *Progreso global:*`,
    `${buildProgressBar(meta.pct_progreso, 15)} *${meta.pct_progreso}%*`,
    `📝 *${meta.datos_dedup.toLocaleString()}* de ${meta.meta_total.toLocaleString()} (dedup teléfono)`,
    `📋 Restante: *${meta.restante.toLocaleString()}* registros`,
    ``,
    `📅 *Elección:* ${eleccionStr} (*${meta.dias_restantes} días*)`,
    `👥 *Agentes activos (7d):* ${meta.agentes_campo} de ${meta.agentes_campo_total} registrados`,
    `📈 *Buffer inactivos:* +${meta.buffer_pct}%`,
    ``,
    `⚡ *Meta diaria por agente: ${meta.meta_diaria_agente} registros*`,
    ``,
  ];

  if ((topHoy as Record<string,unknown>[]).length > 0) {
    lines.push(`🏆 *Hoy vs meta diaria (${meta.meta_diaria_agente}):*`);
    for (const r of topHoy as Record<string,unknown>[]) {
      const hoy = Number(r.hoy);
      const pct = Math.round((hoy / meta.meta_diaria_agente) * 100);
      const icon = pct >= 100 ? "✅" : pct >= 50 ? "🟡" : "🔴";
      lines.push(`${icon} *${r.agente}* ▸ ${hoy}/${meta.meta_diaria_agente} (${pct}%)`);
    }
  } else {
    lines.push(`⚠️ Sin registros hoy todavía.`);
  }

  return lines.join("\n");
}

// ── Comandos de escritura (whitelist por Telegram user ID) ──────────

function isAdmin(userId?: number): boolean {
  if (!userId || !_env?.telegramAdminIds?.length) return false;
  return _env.telegramAdminIds.includes(userId);
}

function buildAdminHelp(): string {
  return [
    `🔐 *Comandos de administración*`,
    ``,
    `🔑 *Contraseñas:*`,
    `• \`/resetpass 955135501\` — resetea contraseña por teléfono`,
    `• \`/resetpass maria@email.com\` — resetea por email`,
    ``,
    `🎯 *Metas:*`,
    `• \`/setmeta cesar vasquez 250000\` — cambia meta total`,
    `• \`/setbuffer cesar vasquez 30\` — cambia buffer %`,
    ``,
    `👤 *Usuarios:*`,
    `• \`/suspender 955135501\` — suspende usuario`,
    `• \`/activar 955135501\` — reactiva usuario`,
    ``,
    `📅 *Reportes programados:*`,
    `• \`/programar diario cesar vasquez 8am 2pm 8pm\``,
    `• \`/programar meta cesar vasquez 6pm\``,
    `• \`/programados\` — ver reportes programados`,
    `• \`/desprogramar 1\` — quitar por número`,
    ``,
    `_Solo usuarios autorizados pueden usar estos comandos._`,
  ].join("\n");
}

async function handleResetPass(identifier: string): Promise<string> {
  const isEmail = identifier.includes("@");
  const { rows } = await pool.query(
    isEmail
      ? `SELECT id, full_name, email, phone FROM users WHERE email = $1`
      : `SELECT id, full_name, email, phone FROM users WHERE phone LIKE $1`,
    [isEmail ? identifier : `%${identifier}`],
  );

  if (rows.length === 0) return `❌ No se encontró usuario con ${isEmail ? "email" : "teléfono"}: ${identifier}`;
  if (rows.length > 1) return `⚠️ Se encontraron ${rows.length} usuarios. Sé más específico.`;

  const user = rows[0] as Record<string, unknown>;
  const newPass = "goberna" + Math.floor(1000 + Math.random() * 9000);

  // Hash with bcrypt (Bun has built-in)
  const hash = await Bun.password.hash(newPass, { algorithm: "bcrypt", cost: 10 });
  await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, user.id]);

  return [
    `✅ *Contraseña reseteada*`,
    ``,
    `👤 *${user.full_name}*`,
    `📞 ${user.phone ?? "—"}`,
    `📧 ${user.email ?? "—"}`,
    `🔑 Nueva contraseña: \`${newPass}\``,
    ``,
    `⚠️ _Comparte la contraseña de forma segura._`,
  ].join("\n");
}

async function handleSetMeta(args: string): Promise<string> {
  // /setmeta cesar vasquez 250000
  const parts = args.match(/^(.+?)\s+(\d+)$/);
  if (!parts) return `❌ Formato: \`/setmeta <campaña> <número>\`\nEj: \`/setmeta cesar vasquez 250000\``;

  const slug = slugFromInput(parts[1]!);
  const metaTotal = parseInt(parts[2]!, 10);

  const { rowCount } = await pool.query(
    `UPDATE campaigns SET config = config || $1::jsonb WHERE slug = $2`,
    [JSON.stringify({ meta_total: metaTotal }), slug],
  );

  if (rowCount === 0) return `❌ No se encontró la campaña: ${parts[1]}`;

  const meta = await calcularMeta(slug!);
  if (!meta) return `✅ Meta actualizada a *${metaTotal.toLocaleString()}* pero no se pudo recalcular.`;

  return [
    `✅ *Meta actualizada*`,
    `📋 ${meta.campana}`,
    `🎯 Nueva meta: *${metaTotal.toLocaleString()}* registros`,
    `⚡ Cuota diaria: *${meta.meta_diaria_agente}* reg/agente`,
    `📅 ${meta.dias_restantes} días restantes`,
  ].join("\n");
}

async function handleSetBuffer(args: string): Promise<string> {
  const parts = args.match(/^(.+?)\s+(\d+)$/);
  if (!parts) return `❌ Formato: \`/setbuffer <campaña> <porcentaje>\`\nEj: \`/setbuffer cesar vasquez 30\``;

  const slug = slugFromInput(parts[1]!);
  const buffer = parseInt(parts[2]!, 10);

  const { rowCount } = await pool.query(
    `UPDATE campaigns SET config = config || $1::jsonb WHERE slug = $2`,
    [JSON.stringify({ buffer_pct: buffer }), slug],
  );

  if (rowCount === 0) return `❌ No se encontró la campaña: ${parts[1]}`;
  return `✅ Buffer actualizado a *+${buffer}%* para ${parts[1]}`;
}

async function handleSuspender(identifier: string, suspend: boolean): Promise<string> {
  const isEmail = identifier.includes("@");
  const { rows } = await pool.query(
    isEmail
      ? `SELECT id, full_name, status FROM users WHERE email = $1`
      : `SELECT id, full_name, status FROM users WHERE phone LIKE $1`,
    [isEmail ? identifier : `%${identifier}`],
  );

  if (rows.length === 0) return `❌ No se encontró usuario: ${identifier}`;
  if (rows.length > 1) return `⚠️ Se encontraron ${rows.length} usuarios. Sé más específico.`;

  const user = rows[0] as Record<string, unknown>;
  const newStatus = suspend ? "suspended" : "active";
  await pool.query(`UPDATE users SET status = $1 WHERE id = $2`, [newStatus, user.id]);

  return `${suspend ? "🔴" : "✅"} *${user.full_name}* — ${suspend ? "suspendido" : "reactivado"}`;
}

// ── Reportes programados ────────────────────────────────────────────

type ScheduledReport = {
  id: number;
  chatId: number;
  command: string;         // "diario", "meta", "semana", "top", "inactivos"
  campaignSlug: string;
  hours: number[];         // horas Lima (0-23)
  createdBy: number;       // Telegram user ID
};

let _scheduledReports: ScheduledReport[] = [];
let _scheduledTimers: ReturnType<typeof setTimeout>[] = [];
let _nextScheduleId = 1;

function scheduleReports(): void {
  // Limpiar timers anteriores
  for (const t of _scheduledTimers) clearTimeout(t);
  _scheduledTimers = [];

  if (_scheduledReports.length === 0) return;

  // Check cada minuto si hay reportes que enviar
  const checkInterval = setInterval(async () => {
    if (!_running) { clearInterval(checkInterval); return; }

    const now = new Date();
    const limaHour = parseInt(now.toLocaleString("en-US", { timeZone: "America/Lima", hour: "numeric", hour12: false }), 10);
    const limaMinute = now.getMinutes();

    // Solo ejecutar en el minuto :00
    if (limaMinute !== 0) return;

    for (const report of _scheduledReports) {
      if (!report.hours.includes(limaHour)) continue;

      try {
        await tgApi("sendChatAction", { chat_id: report.chatId, action: "typing" }).catch(() => {});
        let msg: string;
        switch (report.command) {
          case "diario": msg = await buildDiarioReport(report.campaignSlug); break;
          case "meta": msg = await buildMetaReport(report.campaignSlug); break;
          case "semana": msg = await buildSemanaReport(report.campaignSlug); break;
          case "top": msg = await buildTopReport(report.campaignSlug); break;
          case "inactivos": msg = await buildInactivosReport(report.campaignSlug); break;
          default: continue;
        }
        await reply(report.chatId, msg);
      } catch { /* skip */ }
    }
  }, 60_000);

  _scheduledTimers.push(checkInterval as unknown as ReturnType<typeof setTimeout>);
}

function parseHours(hoursStr: string): number[] {
  const hours: number[] = [];
  for (const part of hoursStr.split(/\s+/)) {
    const match = part.match(/^(\d{1,2})\s*(am|pm)?$/i);
    if (!match) continue;
    let h = parseInt(match[1]!, 10);
    if (match[2]?.toLowerCase() === "pm" && h < 12) h += 12;
    if (match[2]?.toLowerCase() === "am" && h === 12) h = 0;
    if (h >= 0 && h <= 23) hours.push(h);
  }
  return hours;
}

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function handleProgramar(chatId: number, userId: number, args: string): string {
  // /programar diario cesar vasquez 8am 2pm 8pm
  const match = args.match(/^(\w+)\s+(.+?)\s+(\d{1,2}\s*(?:am|pm)(?:\s+\d{1,2}\s*(?:am|pm))*)$/i);
  if (!match) {
    return [
      `❌ Formato: \`/programar <comando> <campaña> <horas>\``,
      ``,
      `Ejemplos:`,
      `• \`/programar diario cesar vasquez 8am 2pm 8pm\``,
      `• \`/programar meta cesar vasquez 6pm\``,
      `• \`/programar top cesar vasquez 12pm 6pm\``,
      ``,
      `Comandos: diario, meta, semana, top, inactivos`,
    ].join("\n");
  }

  const command = match[1]!.toLowerCase();
  if (!["diario", "meta", "semana", "top", "inactivos"].includes(command)) {
    return `❌ Comando no válido: ${command}. Usa: diario, meta, semana, top, inactivos`;
  }

  const slug = slugFromInput(match[2]!);
  const hours = parseHours(match[3]!);
  if (hours.length === 0) return `❌ No se reconocieron las horas. Usa formato: 8am, 2pm, 8pm`;

  const report: ScheduledReport = {
    id: _nextScheduleId++,
    chatId,
    command,
    campaignSlug: slug!,
    hours,
    createdBy: userId,
  };

  _scheduledReports.push(report);
  scheduleReports();

  return [
    `✅ *Reporte programado #${report.id}*`,
    ``,
    `📋 Comando: /${command}`,
    `🏷️ Campaña: ${match[2]}`,
    `🕐 Horas (Lima): ${hours.map(formatHour).join(", ")}`,
    ``,
    `_Se enviará automáticamente a este chat._`,
  ].join("\n");
}

function handleDesprogramar(reportId: number, userId: number): string {
  const idx = _scheduledReports.findIndex(r => r.id === reportId);
  if (idx === -1) return `❌ No se encontró reporte programado #${reportId}`;

  const report = _scheduledReports[idx]!;
  if (report.createdBy !== userId && !isAdmin(userId)) {
    return `❌ Solo quien creó el reporte o un admin puede eliminarlo.`;
  }

  _scheduledReports.splice(idx, 1);
  scheduleReports();

  return `✅ Reporte #${reportId} eliminado (/${report.command} ${report.campaignSlug} a las ${report.hours.map(formatHour).join(", ")})`;
}

function buildProgramados(): string {
  if (_scheduledReports.length === 0) {
    return `📭 No hay reportes programados.\n\n_Usa \`/programar <comando> <campaña> <horas>\` para crear uno._`;
  }

  const lines: string[] = [`📅 *Reportes programados*`, ``];
  for (const r of _scheduledReports) {
    lines.push(`*#${r.id}* — /${r.command} ${r.campaignSlug}`);
    lines.push(`   🕐 ${r.hours.map(formatHour).join(", ")}`);
  }
  lines.push(``);
  lines.push(`_Usa \`/desprogramar <número>\` para quitar._`);

  return lines.join("\n");
}

// ── Análisis comparativo ────────────────────────────────────────────
// Se inyecta en el system prompt de Gemini para que genere queries con comparativas

const COMPARATIVE_PROMPT_ADDON = `
ANÁLISIS COMPARATIVO — Cuando el usuario pida comparaciones, tendencias o análisis:
- Siempre compara con el período anterior (hoy vs ayer, esta semana vs la pasada, este mes vs el anterior).
- Calcula el delta (diferencia) y porcentaje de cambio.
- Identifica agentes que dejaron de subir datos (estaban activos en período anterior, no en el actual).
- Identifica agentes nuevos (no estaban en período anterior, sí en el actual).
- Si hay caídas significativas (>20%), menciona posibles causas.
- Usa subqueries o CTEs para hacer las comparaciones en una sola query.

Ejemplo de query comparativa:
WITH esta_semana AS (
  SELECT submitted_by, COUNT(*) as registros
  FROM form_submissions fs
  WHERE campaign_id = (SELECT id FROM campaigns WHERE slug = 'cesar-vasquez')
  AND created_at >= date_trunc('week', now() AT TIME ZONE 'America/Lima')
  AND deleted_at IS NULL
  GROUP BY submitted_by
),
semana_pasada AS (
  SELECT submitted_by, COUNT(*) as registros
  FROM form_submissions fs
  WHERE campaign_id = (SELECT id FROM campaigns WHERE slug = 'cesar-vasquez')
  AND created_at >= date_trunc('week', now() AT TIME ZONE 'America/Lima') - interval '7 days'
  AND created_at < date_trunc('week', now() AT TIME ZONE 'America/Lima')
  AND deleted_at IS NULL
  GROUP BY submitted_by
)
SELECT
  COALESCE(u.full_name, 'Desconocido') as agente,
  COALESCE(es.registros, 0) as esta_semana,
  COALESCE(sp.registros, 0) as semana_pasada,
  COALESCE(es.registros, 0) - COALESCE(sp.registros, 0) as delta
FROM (SELECT submitted_by FROM esta_semana UNION SELECT submitted_by FROM semana_pasada) todos
LEFT JOIN esta_semana es ON es.submitted_by = todos.submitted_by
LEFT JOIN semana_pasada sp ON sp.submitted_by = todos.submitted_by
LEFT JOIN users u ON u.id = todos.submitted_by
ORDER BY delta ASC LIMIT 30
`;

// ── Alertas automáticas (cron 8pm Lima) ─────────────────────────────

async function checkMetasAlerts(): Promise<void> {
  if (!_env?.telegramChatId) return;

  // Buscar campañas con meta configurada
  const { rows: campanas } = await pool.query(`
    SELECT slug FROM campaigns
    WHERE config->>'meta_total' IS NOT NULL AND status = 'active'
  `);

  for (const c of campanas as Record<string,unknown>[]) {
    const meta = await calcularMeta(c.slug as string);
    if (!meta) continue;

    // Buscar agentes que HOY llegaron a la meta diaria
    const { rows: agentes } = await pool.query(`
      SELECT
        COALESCE(u.full_name, fs.data->>'encuestador') as agente,
        COUNT(*) as hoy
      FROM form_submissions fs
      LEFT JOIN users u ON fs.submitted_by = u.id
      WHERE fs.campaign_id = (SELECT id FROM campaigns WHERE slug = $1)
      AND (fs.created_at AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date
      AND fs.deleted_at IS NULL
      GROUP BY agente
      HAVING COUNT(*) >= $2
    `, [c.slug, meta.meta_diaria_agente]);

    for (const a of agentes as Record<string,unknown>[]) {
      const hoy = Number(a.hoy);
      const pct = Math.round((hoy / meta.meta_diaria_agente) * 100);
      const msg = [
        `🎯 *¡Meta diaria alcanzada!*`,
        ``,
        `👤 *${a.agente}*`,
        `📋 ${meta.campana}`,
        `📝 Hoy: *${hoy}* registros (meta: ${meta.meta_diaria_agente} | *${pct}%*)`,
        ``,
        `🏆 ¡Excelente trabajo!`,
      ].join("\n");
      await reply(Number(_env.telegramChatId), msg);
      await new Promise(r => setTimeout(r, 300));
    }
  }
}

async function sendAlertaDiaria(): Promise<void> {
  if (!_env?.telegramChatId) return;

  // Enviar reporte de cada campaña activa con actividad en los últimos 3 días
  const { rows: campanas } = await pool.query(`
    SELECT DISTINCT c.slug, c.name
    FROM campaigns c
    JOIN form_submissions fs ON fs.campaign_id = c.id
    WHERE c.status = 'active'
    AND fs.created_at >= now() - interval '3 days'
    AND fs.deleted_at IS NULL
    ORDER BY c.name
  `);

  const fecha = new Date().toLocaleDateString("es-PE", {
    timeZone: "America/Lima", weekday: "long", day: "numeric", month: "long",
  });

  // Header
  await reply(Number(_env.telegramChatId), `🌙 *Resumen del día — ${fecha}*`);

  for (const c of campanas as Record<string,unknown>[]) {
    try {
      const reporte = await buildDiarioReport(c.slug as string);
      await reply(Number(_env.telegramChatId), reporte);
      await new Promise(r => setTimeout(r, 500)); // rate limit entre mensajes
    } catch { /* skip failed campaign */ }
  }

  // Inactivos globales al final
  try {
    const inactivos = await buildInactivosReport();
    await reply(Number(_env.telegramChatId), inactivos);
  } catch { /* skip */ }
}

let _alertaTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAlertaDiaria(): void {
  if (_alertaTimer) clearTimeout(_alertaTimer);

  const now = new Date();
  // Hora target: 20:00 Lima (UTC-5 = 01:00 UTC siguiente día)
  const limaOffset = -5 * 60; // minutos
  const limaMs = now.getTime() + (limaOffset - (-now.getTimezoneOffset())) * 60 * 1000;
  const lima = new Date(limaMs);

  let target = new Date(lima);
  target.setHours(20, 0, 0, 0);
  if (lima >= target) target.setDate(target.getDate() + 1); // ya pasó → mañana

  const msUntil = target.getTime() - lima.getTime();

  _alertaTimer = setTimeout(async () => {
    await sendAlertaDiaria().catch(() => {});
    await checkMetasAlerts().catch(() => {});
    scheduleAlertaDiaria(); // reprogramar para mañana
  }, msUntil);
}

// ── Message handler ─────────────────────────────────────────────────

async function executeCampaignCommand(chatId: number, command: string, slug: string): Promise<void> {
  setChatState(chatId, { lastCampaignSlug: slug });
  clearPending(chatId);

  switch (command) {
    case "/meta": await reply(chatId, await buildMetaReport(slug)); break;
    case "/diario": await reply(chatId, await buildDiarioReport(slug)); break;
    case "/semana": await reply(chatId, await buildSemanaReport(slug)); break;
    case "/top": await reply(chatId, await buildTopReport(slug)); break;
    case "/inactivos": await reply(chatId, await buildInactivosReport(slug)); break;
    default: await reply(chatId, `❌ Comando no reconocido: ${command}`);
  }
}

async function handleMessage(chatId: number, userText: string, userId?: number) {
  await tgApi("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

  const state = getChatState(chatId);

  // ── Resolver pending command (user respondió con nombre de campaña) ──
  if (state?.pendingCommand && !userText.startsWith("/")) {
    const slug = slugFromInput(userText);
    if (slug) {
      await executeCampaignCommand(chatId, state.pendingCommand, slug);
      return;
    }
  }

  // ── Comandos directos ──
  if (userText === "/health") {
    await reply(chatId, await buildHealthReport(_env!));
    return;
  }
  if (userText === "/ayuda" || userText === "/help" || userText === "/start") {
    await reply(chatId, buildAyuda());
    return;
  }

  // ── Admin commands (requieren TELEGRAM_ADMIN_IDS) ──
  if (userText === "/admin") {
    if (!isAdmin(userId)) { await reply(chatId, `🔒 No autorizado.`); return; }
    await reply(chatId, buildAdminHelp());
    return;
  }

  const resetMatch = userText.match(/^\/resetpass\s+(.+)$/i);
  if (resetMatch) {
    if (!isAdmin(userId)) { await reply(chatId, `🔒 No autorizado.`); return; }
    await reply(chatId, await handleResetPass(resetMatch[1]!.trim()));
    return;
  }

  const setmetaMatch = userText.match(/^\/setmeta\s+(.+)$/i);
  if (setmetaMatch) {
    if (!isAdmin(userId)) { await reply(chatId, `🔒 No autorizado.`); return; }
    await reply(chatId, await handleSetMeta(setmetaMatch[1]!.trim()));
    return;
  }

  const setbufferMatch = userText.match(/^\/setbuffer\s+(.+)$/i);
  if (setbufferMatch) {
    if (!isAdmin(userId)) { await reply(chatId, `🔒 No autorizado.`); return; }
    await reply(chatId, await handleSetBuffer(setbufferMatch[1]!.trim()));
    return;
  }

  const suspenderMatch = userText.match(/^\/suspender\s+(.+)$/i);
  if (suspenderMatch) {
    if (!isAdmin(userId)) { await reply(chatId, `🔒 No autorizado.`); return; }
    await reply(chatId, await handleSuspender(suspenderMatch[1]!.trim(), true));
    return;
  }

  const activarMatch = userText.match(/^\/activar\s+(.+)$/i);
  if (activarMatch) {
    if (!isAdmin(userId)) { await reply(chatId, `🔒 No autorizado.`); return; }
    await reply(chatId, await handleSuspender(activarMatch[1]!.trim(), false));
    return;
  }

  // ── Scheduled reports (admin-only) ──
  const programarMatch = userText.match(/^\/programar\s+(.+)$/i);
  if (programarMatch) {
    if (!isAdmin(userId)) { await reply(chatId, `🔒 No autorizado.`); return; }
    await reply(chatId, handleProgramar(chatId, userId!, programarMatch[1]!.trim()));
    return;
  }

  if (userText === "/programados") {
    await reply(chatId, buildProgramados());
    return;
  }

  const desprogramarMatch = userText.match(/^\/desprogramar\s+(\d+)$/i);
  if (desprogramarMatch) {
    if (!isAdmin(userId)) { await reply(chatId, `🔒 No autorizado.`); return; }
    await reply(chatId, handleDesprogramar(parseInt(desprogramarMatch[1]!, 10), userId!));
    return;
  }

  // Comandos que requieren campaña: /meta, /diario, /semana, /top, /inactivos
  const cmdMatch = userText.match(/^\/(meta|diario|semana|top|inactivos)(?:\s+(.+))?$/i);
  if (cmdMatch) {
    const command = `/${cmdMatch[1]!.toLowerCase()}`;
    const arg = cmdMatch[2]?.trim();

    if (arg) {
      // Campaña explícita
      const slug = slugFromInput(arg);
      if (slug) {
        await executeCampaignCommand(chatId, command, slug);
        return;
      }
    }

    // Sin campaña — usar la última si existe
    if (state?.lastCampaignSlug) {
      await reply(chatId, `_Usando última campaña seleccionada._`);
      await executeCampaignCommand(chatId, command, state.lastCampaignSlug);
      return;
    }

    // No hay campaña previa — preguntar
    await reply(chatId, await buildCampaignPicker(chatId, command));
    return;
  }

  // ── IA Gemini ──
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

    const respuesta = await geminiFormatResponse(rows, result.descripcion, userText, rowCount, result.tipo);
    await reply(chatId, respuesta);
  } catch (e) {
    const errMsg = String(e).slice(0, 200);
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
      } catch { /* give up */ }
    }

    await reply(chatId, `❌ No pude completar la consulta. Intenta reformular la pregunta.`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

// Convierte texto libre a slug de campaña (fuzzy)
const CAMPAIGN_SLUGS: Record<string, string> = {
  "cesar vasquez": "cesar-vasquez", "cesar": "cesar-vasquez",
  "ernesto bustamante": "ernesto-bustamante", "ernesto": "ernesto-bustamante",
  "fernando rospigliosi": "fernando-rospigliosi", "fernando": "fernando-rospigliosi",
  "fuerza popular": "fuerza-popular", "fuerza": "fuerza-popular",
  "ahora nacion": "ahora-nacion", "ahora": "ahora-nacion",
  "peru primero": "peru-primero", "peru": "peru-primero",
  "edwards infante": "edwards-infante", "edwards": "edwards-infante",
  "guillermo aliaga": "guillermo-aliaga", "guillermo": "guillermo-aliaga",
  "rosangella barbaran": "rosangella-barbaran", "rosangella": "rosangella-barbaran",
  "rocio porras": "rocio-porras", "rocio": "rocio-porras",
  "renovacion popular": "renovacion-popular", "renovacion": "renovacion-popular",
  "yessenia lozano": "yessenia-lozano", "yessenia": "yessenia-lozano",
  "pais para todos": "pais-para-todos",
};

function slugFromInput(input: string): string | undefined {
  const normalized = input.toLowerCase().trim()
    .replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i")
    .replace(/ó/g, "o").replace(/ú/g, "u").replace(/ñ/g, "n");
  return CAMPAIGN_SLUGS[normalized] ?? normalized.replace(/\s+/g, "-");
}

// ── Health & Ayuda ──────────────────────────────────────────────────

function buildAyuda(): string {
  return [
    `🤖 *Goberna Bot*`,
    ``,
    `⚡ *Comandos rápidos:*`,
    `• \`/meta\` — progreso vs meta + cuota diaria`,
    `• \`/meta cesar vasquez\` — meta de esa campaña`,
    `• \`/diario\` — resumen de hoy vs ayer`,
    `• \`/diario cesar vasquez\` — solo esa campaña`,
    `• \`/semana\` — resumen semanal con comparativa`,
    `• \`/top\` — ranking de agentes de hoy`,
    `• \`/inactivos\` — agentes sin actividad +2 días`,
    ``,
    `🤖 *Consultas con IA — escribe /g seguido de tu pregunta:*`,
    ``,
    `📋 *Actividad de agentes:*`,
    `• \`/g actividad de Mónica Sánchez el 11 de marzo\``,
    `• \`/g cuántos registros lleva Elmer Alaya hoy\``,
    `• \`/g top agentes de Lambayeque esta semana\``,
    ``,
    `📊 *Campañas y territorio:*`,
    `• \`/g reporte de César Vásquez en territorio hoy\``,
    `• \`/g registros por departamento esta semana\``,
    `• \`/g reuniones activas de César Vásquez\``,
    ``,
    `📱 *Digital (CMS/WhatsApp):*`,
    `• \`/g métricas de agentes digitales hoy\``,
    `• \`/g cuántos mensajes WA se enviaron esta semana\``,
    ``,
    `🔎 *Usuarios:*`,
    `• \`/g busca al usuario 955135501\``,
    `• \`/g datos de María López\``,
    ``,
    `📅 *Reportes programados:*`,
    `• \`/programar diario cesar vasquez 8am 2pm 8pm\``,
    `• \`/programados\` — ver programados`,
    `• \`/desprogramar 1\` — quitar por número`,
    ``,
    `🔧 *Sistema:*`,
    `• \`/health\` — estado del servidor`,
    `• \`/admin\` — comandos de administración 🔐`,
    ``,
    `🌙 *Alerta automática diaria a las 8pm Lima*`,
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
        message?: { chat: { id: number }; from?: { id: number }; text?: string };
      }>;
    };

    if (!data.ok || !data.result?.length) return;

    for (const update of data.result) {
      _offset = update.update_id + 1;
      const msg = update.message;
      if (!msg?.text?.trim()) continue;

      const raw = msg.text.trim();
      const lower = raw.toLowerCase();
      const fromId = msg.from?.id;

      // /health
      if (lower === "/health" || lower.startsWith("/health@")) {
        handleMessage(msg.chat.id, "/health", fromId).catch(() => {});
        continue;
      }

      // /ayuda, /help, /start
      if (lower === "/ayuda" || lower === "/help" || lower === "/start" || lower.startsWith("/ayuda@")) {
        handleMessage(msg.chat.id, "/ayuda", fromId).catch(() => {});
        continue;
      }

      // ── Admin commands ──
      if (lower === "/admin" || lower.startsWith("/admin@")) {
        handleMessage(msg.chat.id, "/admin", fromId).catch(() => {});
        continue;
      }
      if (lower.startsWith("/resetpass")) {
        handleMessage(msg.chat.id, raw, fromId).catch(() => {});
        continue;
      }
      if (lower.startsWith("/setmeta")) {
        handleMessage(msg.chat.id, raw, fromId).catch(() => {});
        continue;
      }
      if (lower.startsWith("/setbuffer")) {
        handleMessage(msg.chat.id, raw, fromId).catch(() => {});
        continue;
      }
      if (lower.startsWith("/suspender")) {
        handleMessage(msg.chat.id, raw, fromId).catch(() => {});
        continue;
      }
      if (lower.startsWith("/activar")) {
        handleMessage(msg.chat.id, raw, fromId).catch(() => {});
        continue;
      }

      // ── Scheduled reports ──
      if (lower.startsWith("/programar")) {
        handleMessage(msg.chat.id, raw, fromId).catch(() => {});
        continue;
      }
      if (lower === "/programados" || lower.startsWith("/programados@")) {
        handleMessage(msg.chat.id, "/programados", fromId).catch(() => {});
        continue;
      }
      if (lower.startsWith("/desprogramar")) {
        handleMessage(msg.chat.id, raw, fromId).catch(() => {});
        continue;
      }

      // /meta [campaña]
      if (lower.startsWith("/meta")) {
        handleMessage(msg.chat.id, raw, fromId).catch(() => {});
        continue;
      }

      // /diario [campaña]
      if (lower.startsWith("/diario")) {
        handleMessage(msg.chat.id, raw, fromId).catch(() => {});
        continue;
      }

      // /semana [campaña]
      if (lower.startsWith("/semana")) {
        handleMessage(msg.chat.id, raw, fromId).catch(() => {});
        continue;
      }

      // /inactivos [campaña]
      if (lower.startsWith("/inactivos")) {
        handleMessage(msg.chat.id, raw, fromId).catch(() => {});
        continue;
      }

      // /top [campaña]
      if (lower.startsWith("/top")) {
        handleMessage(msg.chat.id, raw, fromId).catch(() => {});
        continue;
      }

      // /g <pregunta> — IA
      const gMatch = raw.match(/^\/[gG](?:@\w+)?\s+([\s\S]+)/);
      if (gMatch) {
        handleMessage(msg.chat.id, gMatch[1]!.trim(), fromId).catch(() => {});
        continue;
      }

      // Respuesta a pending command (texto libre sin /)
      if (!raw.startsWith("/") && getChatState(msg.chat.id)?.pendingCommand) {
        handleMessage(msg.chat.id, raw, fromId).catch(() => {});
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
  scheduleAlertaDiaria(); // cron 8pm Lima
}

export function stopTelegramCommands() {
  _running = false;
  if (_alertaTimer) { clearTimeout(_alertaTimer); _alertaTimer = null; }
}

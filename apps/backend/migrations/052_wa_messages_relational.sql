-- 052: wa_messages relacional + flags de grupo en conversations.
--
-- Motivación:
--   El `conversations.messages` es JSONB array (cap 500) con shape
--   `{d, t, ts, op}`. Sirve para texto 1:1 pero no escala para:
--     - Imágenes / audio / video / docs (necesitan URL, mime, size).
--     - Reacciones (apuntan a un mensaje previo por external_id).
--     - Mensajes de grupo (sender ≠ contraparte de la conversación).
--     - Quoted replies (referencia a mensaje previo).
--
--   Esta migration crea `wa_messages` como tabla relacional pivotando sobre
--   `conversation_id`. La JSONB array sigue existiendo para no romper queries
--   viejas — la nueva tabla es source of truth, la JSONB queda como caché
--   denormalizada de los últimos N para listados rápidos.
--
-- Decisión: external_id es el `msg.key.id` de Baileys. Lo usamos para:
--   - Deduplicar (mismo bot puede pushear el mismo mensaje 2x si retry).
--   - Mapear reacciones (reaction_to_external_id) y quoted replies
--     (quoted_external_id) sin tener que joinear por offset.
--
-- Compat: la migration NO toca `conversations.messages`. Los inserts viejos
-- (text-only, vía `conversationsRepo.upsertMessage`) siguen funcionando.
-- El bot nuevo va a hacer dos cosas: append al JSONB (compat) Y insert en
-- wa_messages (full fidelity). Si el doble-write fastidia, removemos la
-- compat en una migration posterior.

CREATE TABLE IF NOT EXISTS wa_messages (
  id                       BIGSERIAL    PRIMARY KEY,
  conversation_id          BIGINT       NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  -- WhatsApp msg id (Baileys: msg.key.id). Único por conversación —
  -- permite dedup en re-pushes y resolución de reacciones / quotes.
  external_id              TEXT,

  direction                TEXT         NOT NULL CHECK (direction IN ('in', 'out')),

  -- text | image | audio | video | document | sticker | location | contact |
  -- reaction | system. 'system' captura eventos no-conversacionales (call,
  -- protocol, etc.) que el bot reciba y queramos auditar.
  message_type             TEXT         NOT NULL DEFAULT 'text',

  -- Contenido textual: para text es el body; para media es el caption;
  -- para reaction es el emoji renderizable; para system es la descripción.
  text                     TEXT         NOT NULL DEFAULT '',

  -- ── Media ──
  -- Cuando el bot recibe imagen/audio/video/doc/sticker, descarga el archivo
  -- y lo sube vía POST /api/cms/wa-media. El response trae url/mime/size que
  -- el bot pone acá al pushear el evento.
  media_url                TEXT,
  media_mime               TEXT,
  media_size_bytes         BIGINT,
  media_caption            TEXT,
  -- Para audio: duración en segundos. Para video: idem. Null si no aplica.
  media_duration_sec       INT,
  -- Para imagen/video: url de un thumbnail jpeg pequeño (preview) si Baileys
  -- lo emite (jpegThumbnail). Render rápido en el CMS sin descargar el full.
  media_thumb_url          TEXT,

  -- ── Group context ──
  -- Cuando es_group=true en la conversation, el sender real (autor del msg)
  -- es distinto del jid de la conversation (que es el group jid). Capturamos
  -- el jid + nombre que reportó Baileys (msg.key.participantPn / pushName).
  sender_jid               TEXT,
  sender_name              TEXT,

  -- ── Reaction context (cuando message_type='reaction') ──
  reaction_to_external_id  TEXT,
  reaction_emoji           TEXT,

  -- ── Quoted reply (mensaje al que responde este, si aplica) ──
  quoted_external_id       TEXT,

  -- ── Operator (outbound) ──
  -- En outbound iniciado desde electoral, el bot recibe operator_id en el
  -- body del send-order y lo refleja acá. En outbound manual del operador
  -- (típico cuando el operador escribe desde su celular real conectado a
  -- Baileys), operator_id queda null y operator_name puede ser ''.
  operator_id              UUID,
  operator_name            TEXT,

  -- ── Metadata ──
  ts_ms                    BIGINT       NOT NULL,    -- epoch ms del mensaje (msg.messageTimestamp * 1000)
  raw_payload              JSONB,                    -- dump opcional del msg.message para debug; nullable
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Lista paginada por conversación, ordenada por tiempo.
CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation
  ON wa_messages (conversation_id, ts_ms DESC);

-- Lookup por external_id para dedup + resolución de reacciones / quotes.
-- Parcial porque external_id puede ser null en sintéticos (system events).
CREATE INDEX IF NOT EXISTS idx_wa_messages_external_id
  ON wa_messages (external_id)
  WHERE external_id IS NOT NULL;

-- Lookup de "qué reacciones tengo encima" para un mensaje.
CREATE INDEX IF NOT EXISTS idx_wa_messages_reaction_target
  ON wa_messages (reaction_to_external_id)
  WHERE reaction_to_external_id IS NOT NULL;

-- Filtros del CMS por tipo (ej: "ver solo audios" / "ver solo imágenes").
CREATE INDEX IF NOT EXISTS idx_wa_messages_type
  ON wa_messages (conversation_id, message_type)
  WHERE message_type != 'text';

-- Dedup soft: external_id único por conversación, ignorando los nulos.
-- Permite re-push idempotente del mismo msg.key.id.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_messages_conv_external
  ON wa_messages (conversation_id, external_id)
  WHERE external_id IS NOT NULL;

-- ── conversations: marcador de grupo ──
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_group       BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS group_subject  TEXT;

COMMENT ON COLUMN conversations.is_group IS
  'True cuando jid es @g.us (grupo). El sender real de cada mensaje vive en wa_messages.sender_jid, no acá.';

COMMENT ON COLUMN conversations.group_subject IS
  'Nombre del grupo reportado por Baileys (chat.subject). Puede cambiar con el tiempo — actualizamos cuando llega un mensaje con subject distinto.';

CREATE INDEX IF NOT EXISTS idx_conversations_is_group
  ON conversations (campaign_id, is_group)
  WHERE is_group = TRUE;

-- 048_sanitize_media_placeholders_in_learned.sql
--
-- Limpia learned_replies cuya response_text contiene placeholders de media
-- ("🖼 [imagen]", "🎤 [nota de voz]", "🩵 [sticker]", "📄 [documento]") o
-- base64 chunks de imágenes (cuando Baileys logueó la jpeg inline).
--
-- Origen: el mining (getInboundOutboundPairs) toma interactions.body y
-- algunas tienen estos markers porque Kathy enviaba imagen+caption y la
-- captura del histórico se quedó con el placeholder en lugar de la imagen.
-- El bot manda esa basura textual al lead → "🖼 [imagen]" como string.
--
-- Estrategia:
--   1. Sanitize: borrar líneas que sean SOLO un placeholder (con sus blanks
--      circundantes). Si el response queda <20 chars o vacío → archive.
--   2. Borrar base64 blobs (líneas que arrancan con "/9j/" + cadena larga).
--   3. Re-encode el embedding → no es necesario; el filtro en hot path
--      (matching) sigue funcionando con el texto sanitizado, solo que el
--      score puede variar levemente. Si baja del threshold simplemente no
--      matchea — fail-safe.

-- Helper: regex que matchea una línea-placeholder con sus newlines opuestos.
-- E.g. "...texto\n\n🖼 [imagen]\n\n..." → "...texto\n\n..."
WITH placeholders AS (
  SELECT id,
         regexp_replace(
           regexp_replace(
             response_text,
             -- Línea solo placeholder (con emojis o sin) — borrar línea + newlines circundantes
             '(\n+)?\s*(🖼\s*)?\[imagen\]\s*(\n+)?|(\n+)?\s*🎤\s*\[nota de voz\]\s*(\n+)?|(\n+)?\s*🩵\s*\[sticker\]\s*(\n+)?|(\n+)?\s*📄\s*\[documento\]\s*(\n+)?|(\n+)?\s*\[image\]\s*(\n+)?|(\n+)?\s*\[video\]\s*(\n+)?|(\n+)?\s*\[audio\]\s*(\n+)?|(\n+)?\s*\[sticker\]\s*(\n+)?|(\n+)?\s*\[document\]\s*(\n+)?',
             E'\n\n',
             'g'
           ),
           -- Base64 chunks: secuencias alphanumeric/+/= largas (50+ chars sin espacios)
           '(/9j/[A-Za-z0-9+/=]{50,}|[A-Za-z0-9+/=]{200,})',
           '',
           'g'
         ) AS sanitized
    FROM learned_replies
   WHERE status = 'active'
     AND response_text ~ '\[imagen\]|\[image\]|\[video\]|\[audio\]|\[sticker\]|\[document\]|nota de voz|/9j/[A-Za-z0-9+/=]{50,}'
)
UPDATE learned_replies lr
   SET response_text = trim(both E'\n \t' FROM regexp_replace(p.sanitized, E'\n{3,}', E'\n\n', 'g')),
       status = CASE
         WHEN length(trim(both E'\n \t' FROM p.sanitized)) < 20 THEN 'archived'
         ELSE 'active'
       END
  FROM placeholders p
 WHERE lr.id = p.id;

-- Stats post-sanitize
SELECT
  count(*) FILTER (WHERE status = 'archived') AS now_archived,
  count(*) FILTER (WHERE response_text ~ '\[imagen\]|\[image\]|/9j/') AS still_dirty,
  count(*) AS total
FROM learned_replies;

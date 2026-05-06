-- 031_chat_groups_meta.sql
-- Soporte para chats de grupo + atención + enrichment desde escuela ERP.
--
-- 1. leads.is_group + group_subject (cacheado del último mensaje grupal).
--    Antes el bot no marcaba grupos, todo iba como lead individual. Ahora
--    podemos filtrar Chats / Grupos / Atención en /cms.
-- 2. leads.last_chat_kind (dm / group / status) — para indicador visual.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS is_group       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS group_subject  TEXT,
  ADD COLUMN IF NOT EXISTS group_jid      TEXT,
  ADD COLUMN IF NOT EXISTS last_chat_kind TEXT NOT NULL DEFAULT 'dm';

CREATE INDEX IF NOT EXISTS idx_leads_is_group       ON leads(is_group) WHERE is_group = TRUE;
CREATE INDEX IF NOT EXISTS idx_leads_last_chat_kind ON leads(last_chat_kind);

-- Backfill desde meta de interactions: si la última interacción tiene
-- meta.is_group = true, marcar el lead.
UPDATE leads l
   SET is_group = TRUE,
       group_subject = sub.subject,
       group_jid = sub.jid,
       last_chat_kind = 'group'
  FROM (
    SELECT DISTINCT ON (lead_id)
      lead_id,
      meta->>'group_subject' AS subject,
      meta->>'group_jid'     AS jid,
      meta->>'is_group'      AS is_g
    FROM interactions
    WHERE (meta->>'is_group')::bool = TRUE
    ORDER BY lead_id, id DESC
  ) sub
 WHERE l.id = sub.lead_id;

-- Vista para el endpoint /chats: agrupa leads por kind y trae el último msg
CREATE OR REPLACE VIEW v_chats_summary AS
SELECT
  l.id                         AS lead_id,
  l.name,
  l.phone,
  l.country,
  l.stage,
  l.tags,
  l.is_group,
  l.group_subject,
  l.last_chat_kind,
  l.needs_human_attention,
  l.attention_at,
  l.buyer_tier,
  l.total_usd_spent,
  l.escuela_client_id,
  l.last_course,
  (SELECT body FROM interactions
    WHERE lead_id = l.id AND kind IN ('message_in', 'message_out')
    ORDER BY id DESC LIMIT 1)  AS last_message,
  (SELECT created_at FROM interactions
    WHERE lead_id = l.id AND kind IN ('message_in', 'message_out')
    ORDER BY id DESC LIMIT 1)  AS last_message_at,
  (SELECT count(*) FROM interactions
    WHERE lead_id = l.id AND kind = 'message_in'
      AND id > COALESCE(l.last_read_at, 0))      AS unread_count
FROM leads l
WHERE EXISTS (SELECT 1 FROM interactions WHERE lead_id = l.id);

SELECT
  count(*) FILTER (WHERE is_group = FALSE) AS dms,
  count(*) FILTER (WHERE is_group = TRUE)  AS grupos,
  count(*) FILTER (WHERE needs_human_attention) AS atencion
FROM leads;

-- Fix v_chats_summary: last_read_at es TIMESTAMPTZ, no INT
DROP VIEW IF EXISTS v_chats_summary;
CREATE VIEW v_chats_summary AS
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
    WHERE lead_id = l.id
      AND kind = 'message_in'
      AND created_at > COALESCE(l.last_read_at, '1970-01-01'::timestamptz)) AS unread_count
FROM leads l
WHERE EXISTS (SELECT 1 FROM interactions WHERE lead_id = l.id);

SELECT count(*) FROM v_chats_summary;

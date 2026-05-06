-- 039_track_rule_hits.sql
-- Endpoint helper: incrementar hits_count cuando una regla matchea.
-- Function que el bot llama en batch para no hacer update por cada mensaje.

CREATE OR REPLACE FUNCTION increment_rule_hits(rule_ids INT[]) RETURNS void AS $$
BEGIN
  IF rule_ids IS NULL OR array_length(rule_ids, 1) IS NULL THEN RETURN; END IF;
  UPDATE ai_rules
     SET hits_count = hits_count + 1,
         last_hit_at = now()
   WHERE id = ANY(rule_ids);
END;
$$ LANGUAGE plpgsql;

-- Backfill histórico: contar quién matcheó qué en interactions
WITH hits AS (
  SELECT r.id AS rule_id, count(*)::int AS n
    FROM interactions i
    JOIN ai_rules r ON r.enabled = TRUE
   WHERE i.kind = 'message_in'
     AND i.body IS NOT NULL
     AND i.body ~* r.pattern
     AND i.created_at > now() - interval '90 days'
   GROUP BY r.id
)
UPDATE ai_rules ar
   SET hits_count = h.n
  FROM hits h
 WHERE ar.id = h.rule_id;

-- Stats post-backfill
SELECT
  count(*) FILTER (WHERE hits_count > 0)  AS rules_used,
  count(*) FILTER (WHERE hits_count = 0)  AS rules_unused,
  sum(hits_count) AS total_hits
FROM ai_rules WHERE enabled = TRUE;

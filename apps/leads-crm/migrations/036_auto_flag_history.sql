-- Auto-flag leads con sales-ready signals desde su historial de mensajes
-- (no condicionado a 14 días — todo el histórico)

UPDATE leads l
   SET needs_human_attention = TRUE,
       attention_reason = CASE
         WHEN EXISTS (
           SELECT 1 FROM interactions
            WHERE lead_id = l.id AND kind = 'message_in'
              AND body ~* '(comprobante|ya\s*hice\s*el\s*(pago|yape)|deposit[eé]|transfer[ií])'
         ) THEN 'historico:pago_realizado'
         WHEN EXISTS (
           SELECT 1 FROM interactions
            WHERE lead_id = l.id AND kind = 'message_in'
              AND body ~* '(quiero\s*inscrib|mandame\s*el\s*link|d[oó]nde\s*pago|c[oó]mo\s*me\s*inscribo)'
         ) THEN 'historico:high_intent'
         WHEN EXISTS (
           SELECT 1 FROM interactions
            WHERE lead_id = l.id AND kind = 'message_in'
              AND body ~* '(molest|enoj|todav[ií]a\s*sin|no\s*me\s*responden|por\s*qu[eé]\s*tardan)'
         ) THEN 'historico:frustration'
       END,
       attention_at = COALESCE(attention_at, now())
 WHERE NOT l.needs_human_attention
   AND EXISTS (
     SELECT 1 FROM interactions i
      WHERE i.lead_id = l.id
        AND i.kind = 'message_in'
        AND (
          i.body ~* '(comprobante|ya\s*hice\s*el\s*(pago|yape)|deposit[eé]|transfer[ií])'
          OR i.body ~* '(quiero\s*inscrib|mandame\s*el\s*link|d[oó]nde\s*pago|c[oó]mo\s*me\s*inscribo)'
          OR i.body ~* '(molest|enoj|todav[ií]a\s*sin|no\s*me\s*responden|por\s*qu[eé]\s*tardan)'
        )
   );

-- Stats
SELECT
  count(*) FILTER (WHERE needs_human_attention) AS pending_attention,
  count(*) FILTER (WHERE attention_reason = 'historico:pago_realizado') AS pago_realizado,
  count(*) FILTER (WHERE attention_reason = 'historico:high_intent') AS high_intent,
  count(*) FILTER (WHERE attention_reason = 'historico:frustration') AS frustration
FROM leads;

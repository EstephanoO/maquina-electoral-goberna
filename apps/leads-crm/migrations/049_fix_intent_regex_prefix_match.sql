-- 049_fix_intent_regex_prefix_match.sql
--
-- Bug: varios intent regex usan \b(...|inscrib|...)\b — el \b al final
-- exige word boundary DESPUÉS, lo cual rompe matching para palabras como
-- "inscribirme" (continúa con "irme", no hay \b después de "inscrib").
--
-- Reportado en sesión 2026-05-07 — un lead escribió "como podría inscribirme?"
-- y el bot cayó a learned_reply (bank info) en lugar de matchear intent:matricula
-- → category:inscripcion → template datos para registro.
--
-- Fix: reemplazar \b(prefix|...|prefix)\b por \b(prefix|...) sin cierre. Así
-- los prefijos parciales matchean (inscrib → inscribir, inscribirme,
-- inscripción, inscriptase, etc.).

-- intent:matricula: inscrib y matr[ií]cul deben aceptar sufijos.
UPDATE ai_rules
   SET pattern = '(?i)\b(matr[ií]cul|inscrib|me\s*apunto|inscripci[oó]n)'
 WHERE name = 'intent:matricula'
   AND pattern LIKE '%inscrib|me\s*inscrib|inscripci%';

-- intent:pago_completed: deposit, transferenc, pago, pagu[eé], transfer[ií]
-- todos necesitan match de prefijo (deposito, transferencia, pagaste, etc.).
UPDATE ai_rules
   SET pattern = '(?i)(\bya\s*(pagu[eé]|hice\s*(el|la)?\s*(deposit|transferenc|pago)|deposit[eé]|transfer[ií])|env[ií][oae]?\s*(el)?\s*(comprobante|voucher|captura\s*del?\s*pago)|aqu[ií]\s*(est[aá]|va)\s*(mi)?\s*(comprobante|voucher)|adjunt[oa]\s*(mi)?\s*(comprobante|voucher)|hice\s*(el)?\s*pago|hice\s*la\s*transferencia|reci[eé]n\s*pagu[eé])'
 WHERE name = 'intent:pago_completed';

-- Augmentar template inscripcion principal: agregar cierre "Quedo atenta para
-- el registro" (mensaje de seguimiento que Kathy usa). Sirve como recordatorio
-- al lead de que el bot está esperando los datos.
UPDATE templates
   SET body = body || E'\n\nQuedo atenta para el registro 🙂',
       updated_at = now()
 WHERE name = 'inscripcion_para_ayudarte_con_tu_inscripci'
   AND body NOT LIKE '%Quedo atenta para el registro%';

UPDATE templates
   SET body = body || E'\n\nQuedo atenta para el registro 🙂',
       updated_at = now()
 WHERE name = 'kathy_datos_registro'
   AND body NOT LIKE '%Quedo atenta para el registro%';

-- Stats post-fix
SELECT name, left(pattern, 90) AS pattern_preview
  FROM ai_rules
 WHERE name IN ('intent:matricula', 'intent:pago_completed');

SELECT name, length(body) AS body_len, body LIKE '%Quedo atenta%' AS has_followup
  FROM templates
 WHERE name IN ('inscripcion_para_ayudarte_con_tu_inscripci', 'kathy_datos_registro');

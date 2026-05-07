-- 051_strip_pcre_inline_flag_from_rules.sql
--
-- BUG GRANDE: la mayoría de ai_rules tienen pattern con prefijo `(?i)` —
-- syntaxis PCRE/POSIX que PostgreSQL ~* acepta, pero JavaScript NO. El bot
-- (apps/leads-crm/bot/src/classifier.ts) compila con `new RegExp(pattern, "i")`
-- y JS lanza SyntaxError "Invalid group" para `(?i)`, el catch lo silencia
-- y el rule queda deshabilitado.
--
-- Resultado: intent:matricula, intent:saludo, intent:precio, intent:pago,
-- intent:certificado_descarga, etc. nunca matchearon en JS desde que se
-- añadieron. La cascade caía siempre a learned_replies o semantic fallback.
--
-- Fix:
--   1. Strip `(?i)` prefix de TODOS los rules — el bot ya pasa flag "i"
--      al constructor, así que es redundante.
--   2. classifier.ts también hace strip defensivo (commit acompañante)
--      para ser robusto a rules futuras con `(?i)` accidentales.

UPDATE ai_rules
   SET pattern = regexp_replace(pattern, '^\s*\(\?i\)\s*', ''),
       updated_at = now()
 WHERE pattern ~ '^\s*\(\?i\)';

-- Stats post-fix
SELECT
  count(*) FILTER (WHERE pattern ~ '^\s*\(\?i\)') AS still_with_pcre_flag,
  count(*) AS total_rules,
  count(*) FILTER (WHERE enabled) AS enabled
FROM ai_rules;

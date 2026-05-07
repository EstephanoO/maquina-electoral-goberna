-- 044_auto_reply_whitelist.sql
-- Whitelist de números para auto_reply (modo testing).
--
-- Por qué: cuando se está afinando el cascade del bot (cambios en learned_
-- replies, threshold, prompts), querés probar sin afectar leads reales.
-- Setea auto_reply_whitelist={'+51955135507'} y el bot solo responde a
-- ese número, ignorando todos los demás. Cuando NULL/vacío, responde a
-- todos (comportamiento normal).
ALTER TABLE bot_instances
  ADD COLUMN IF NOT EXISTS auto_reply_whitelist TEXT[];

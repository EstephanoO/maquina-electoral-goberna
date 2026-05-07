-- Sprint 2.E (2026-05-07): drop trigger pre-existente broken.
--
-- log_auto_reply_followup_trigger en interactions intentaba insertar en
-- ai_feedback con columnas obsoletas (suggested_tag, correct_tag). El
-- schema actual usa original_tags / corrected_tags (text[]) y exige
-- message_text NOT NULL. El trigger nunca tuvo cobertura en el schema
-- nuevo y solo fallaba ahora porque al sacar la whitelist de p4 entró
-- tráfico real con auto-replies + manual followups.
--
-- Bloqueaba el flow de POST /messages cada vez que entraba un manual
-- outbound dentro de la hora siguiente a un auto-reply.
--
-- Si en el futuro queremos volver a capturar "manual followup as
-- correction" para feedback loop, hay que rediseñar con el schema actual
-- (insertar en picker_feedback de Sprint 2.C, no ai_feedback).

DROP TRIGGER IF EXISTS log_auto_reply_followup_trigger ON interactions;
DROP FUNCTION IF EXISTS log_auto_reply_followup();

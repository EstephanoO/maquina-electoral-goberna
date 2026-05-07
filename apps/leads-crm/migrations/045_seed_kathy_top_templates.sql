-- 045_seed_kathy_top_templates.sql
--
-- Top 3 patrones recurrentes en histórico p4 (83× cada uno) → templates
-- explícitos con categoría propia + ai_rules para enrutarlos. Estos ganan
-- en cascade ANTES que learned_replies (paso 2 — tag → category — del
-- pickTemplateWithSemantic).
--
-- Análisis: sesión 2026-05-07 sobre 514 inbounds / 1321 outbounds Kathy.
-- Los 3 patrones representan ~250 / 1321 = 19% del output total.

-- =====================================================================
-- 1. Templates
-- =====================================================================
INSERT INTO templates (name, body, category, uses_count) VALUES
  ('kathy_sales_opener_ia',
   E'Hola buenas tardes. Un gusto. ¿Se encuentra interesada en realizar su inscripción en el *Diploma de IA y Marketing Político*? 🙂',
   'sales_opener_ia',
   83),

  ('kathy_info_duracion_ia',
   E'El diploma dura *3 semanas* de clases en vivo mediante la plataforma zoom y también quedan grabadas y se suben al campus virtual. Como alumna tendrá acceso a la plataforma para que pueda revisar las clases.

Las clases serán los días *lunes, miércoles y viernes* de 6:00 PM a 8:00 PM (GMT-5) 🎓',
   'info_duracion',
   83),

  ('kathy_datos_registro',
   E'💪 Para ayudarte con tu inscripción me confirmas los siguientes datos:
🖊️ *DATOS PARA EL REGISTRO*
✅ Foto de comprobante de pago:
✅ Nombre(s):
✅ Apellidos:
✅ Correo:
✅ Provincia:
✅ Ciudad:
✅ Ocupación:
✅ DNI:',
   'datos_registro',
   83)
ON CONFLICT (name) DO UPDATE SET
  body = EXCLUDED.body,
  category = EXCLUDED.category,
  uses_count = EXCLUDED.uses_count,
  updated_at = now();

-- =====================================================================
-- 2. AI rules (intents que enrutan a estas categorías)
-- =====================================================================
INSERT INTO ai_rules (name, description, pattern, tag, weight, enabled, source) VALUES
  ('intent:sales_opener_ia',
   'Lead muestra interés en IA y Marketing Político — opener Kathy (qualifying question antes del flyer)',
   '(?i)\b(diploma\s*(de|en)?\s*ia\b|ia\s*(y|en|para)\s*marketing|marketing\s*(con|y)\s*ia\b|marketing\s*pol[ií]tic.{0,20}\bia\b|\bia\b.{0,20}marketing\s*pol[ií]tic|inteligencia\s*artificial.{0,30}marketing|marketing.{0,30}inteligencia\s*artificial)\b',
   'intent:sales_opener_ia',
   1.0,
   TRUE,
   'kathy_top'),

  ('intent:pago_completed',
   'Lead ya pagó / envía comprobante → bot pide datos para registro',
   '(?i)(\bya\s*(pagu[eé]|hice\s*(el|la)?\s*(deposit|transferenc|pago)|deposit[eé]|transfer[ií])\b|env[ií][oae]?\s*(el)?\s*(comprobante|voucher|captura\s*del?\s*pago)|aqu[ií]\s*(est[aá]|va)\s*(mi)?\s*(comprobante|voucher)|adjunt[oa]\s*(mi)?\s*(comprobante|voucher)|hice\s*(el)?\s*pago|hice\s*la\s*transferencia|reci[eé]n\s*pagu[eé])',
   'intent:pago_completed',
   1.0,
   TRUE,
   'kathy_top'),

  ('intent:duracion',
   'Pregunta puntual por duración del diploma (más específica que intent:horario_fecha)',
   '(?i)\b(cu[aá]nto\s*dura|cu[aá]ntas\s*semanas|cu[aá]nto\s*tiempo\s*(dura|son)|duraci[oó]n\s*del?\s*(diploma|curso|programa)|qu[eé]\s*tan\s*largo)\b',
   'intent:duracion',
   1.0,
   TRUE,
   'kathy_top')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 3. Stats
-- =====================================================================
SELECT
  'templates kathy_top' AS bucket,
  count(*) AS rows
FROM templates
WHERE name LIKE 'kathy_%'
UNION ALL
SELECT 'ai_rules kathy_top', count(*)
FROM ai_rules
WHERE source = 'kathy_top';

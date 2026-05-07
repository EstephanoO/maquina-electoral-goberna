-- 022_import_bot_hardcoded_rules.sql
-- Importa las 12 PRODUCT_RULES hard-coded del bot (apps/leads-crm/bot/src/classifier.ts)
-- como ai_rules editables desde la UI. Source = 'bot_legacy' para distinguir.
--
-- Una vez en la DB el bot puede leerlas via /ai/rules y queda DRY: editás en UI,
-- el bot las recoge en su próximo refresh de cache (60s).

INSERT INTO ai_rules (name, description, pattern, tag, weight, enabled, source) VALUES
  ('producto:oratoria',
   'Detecta interés en curso de Oratoria',
   '(?i)\boratoria\b|poder de la oratoria|libro.*oratoria|curso.*oratoria',
   'producto:oratoria', 1.0, TRUE, 'bot_legacy'),

  ('producto:consultor-politico',
   'Detecta interés en Diploma de Consultor Político',
   '(?i)consultor\s*pol[ií]tic|diploma\s*(internacional|consultor)|consultor[ií]a\s*pol[ií]tic',
   'producto:consultor-politico', 1.0, TRUE, 'bot_legacy'),

  ('producto:inteligencia-emocional',
   'Detecta interés en Inteligencia Emocional',
   '(?i)inteligencia\s*emocional',
   'producto:inteligencia-emocional', 1.0, TRUE, 'bot_legacy'),

  ('producto:marketing-politico',
   'Detecta interés en Marketing Político',
   '(?i)marketing\s*pol[ií]tic|marketing\s*electoral|campa[ñn]a\s*(electoral|pol[ií]tic)',
   'producto:marketing-politico', 1.0, TRUE, 'bot_legacy'),

  ('producto:liderazgo',
   'Detecta interés en cursos de Liderazgo',
   '(?i)curso.*liderazgo|liderazgo.*curso|liderazgo\s*pol[ií]tic',
   'producto:liderazgo', 1.0, TRUE, 'bot_legacy'),

  ('producto:comunicacion-politica',
   'Detecta interés en Comunicación Política / Estratégica',
   '(?i)comunicaci[oó]n\s*pol[ií]tic|comunicaci[oó]n\s*estrat[eé]gic',
   'producto:comunicacion-politica', 1.0, TRUE, 'bot_legacy'),

  ('producto:gobernabilidad',
   'Detecta interés en Gobernabilidad / Gestión Pública',
   '(?i)gobernabilidad|gesti[oó]n\s*p[uú]blica',
   'producto:gobernabilidad', 1.0, TRUE, 'bot_legacy'),

  ('producto:gestion-parlamentaria-hardcoded',
   'Auditoría 2026-05-06: Gestión Parlamentaria',
   '(?i)gesti[oó]n\s*parlamentari|parlamentari[ao]\s*bicameral|diploma.*parlamentari|t[eé]cnico\s*de\s*gesti[oó]n\s*parlamentari',
   'producto:gestion-parlamentaria', 1.0, TRUE, 'bot_legacy'),

  ('producto:analisis-inteligencia',
   'Detecta interés en Análisis de Inteligencia',
   '(?i)an[aá]lisis\s*de\s*(la\s*)?inteligencia|inteligencia\s*estrat[eé]gic|analista\s*de\s*inteligencia',
   'producto:analisis-inteligencia', 1.0, TRUE, 'bot_legacy'),

  ('producto:campanas-contraste',
   'Detecta interés en Campañas de Contraste',
   '(?i)campa[ñn]as?\s*de\s*contraste|\bcontraste\s*pol[ií]tic|guerra\s*sucia',
   'producto:campanas-contraste', 1.0, TRUE, 'bot_legacy'),

  ('producto:geopolitica',
   'Detecta interés en Geopolítica',
   '(?i)\bgeopol[ií]tic|geoestrateg',
   'producto:geopolitica', 1.0, TRUE, 'bot_legacy'),

  ('producto:negociacion-politica',
   'Detecta interés en Negociación Política',
   '(?i)negociaci[oó]n\s*pol[ií]tic|negociaci[oó]n\s*estrat[eé]gic|resoluci[oó]n\s*de\s*conflictos',
   'producto:negociacion-politica', 1.0, TRUE, 'bot_legacy'),

  -- Intent signals globales (no son productos sino marcadores de interés)
  ('intent:info_request',
   'Lead pidió información (intent fuerte)',
   '(?i)\b(interesa|quiero|deseo|quisiera|necesito|informaci[oó]n|info\b|detalles|inscri[bp]|adquirir|comprar)\b',
   'intent:info_request', 0.6, TRUE, 'bot_legacy'),

  ('intent:auto_inquiry',
   'Mensaje de auto-inquiry (preset estándar de WA)',
   '(?i)^(hola[,!.]?\s*)?(me\s+interesa|quiero\s+(m[aá]s\s+)?detalles|quiero\s+informaci[oó]n)',
   'intent:auto_inquiry', 0.8, TRUE, 'bot_legacy')

ON CONFLICT DO NOTHING;

SELECT
  source,
  count(*) AS reglas,
  count(*) FILTER (WHERE enabled) AS activas
FROM ai_rules
GROUP BY source
ORDER BY reglas DESC;

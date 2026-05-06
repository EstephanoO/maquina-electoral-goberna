-- 024_seed_full_p4.sql
-- Aprende del histórico completo de p4 (2,863 mensajes IN, 6,017 OUT analizados).
--
-- Hallazgos clave:
--   • TOP productos mencionados: Oratoria (29), Consultor Político (25),
--     Gestión Parlamentaria (22), Director Comunicaciones (15),
--     Análisis Inteligencia (13). Consultor Político y Liderazgo NO estaban
--     featured pero son los más demandados.
--   • Agentes activos: Kathy (89 usos), Jahelly Justiniano (13).
--   • Cuenta canónica: BCP 1939936368051 / IB 2003004813730 / Yape 944531711.
--   • Geo: Quito (18) > México (7) > Lima (5) > Guayaquil (4) — internacional.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Agregar productos faltantes que SÍ se demandan en el chat real
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO escuela_products
  (sku, nombre, descripcion, precio_soles, precio_dolares, dias_semana, horario,
   horas_academicas, modalidad, link_matricula,
   classifier_pattern, classifier_tag, featured, created_by)
VALUES
  ('CONSULTOR-POL-2026', 'Diploma Internacional Consultor Político',
   '🎓 Diploma Internacional en Consultoría Política. El curso más demandado del catálogo (69 broadcasts en p4). Para asesores, comunicadores y profesionales que arman estrategias políticas integrales.',
   400, 120,
   'Lunes, Miércoles y Viernes', '7:00 p.m. a 9:00 p.m. (GMT-5)',
   '120 HORAS', 'zoom', 'https://api.openpay.pe/occ/CrQe7GcQPWnh',
   '(?i)consultor[ií]a?\s*pol[ií]tic|diploma\s*(internacional\s*)?consultor',
   'producto:consultor-politico', TRUE, 'system_learn_p4'),

  ('LIDERAZGO-POL-2026', 'Diploma de Liderazgo Político',
   'Diploma para líderes políticos y de movimientos sociales. Construcción de visión, equipo y narrativa de poder.',
   500, 150,
   'Martes y Jueves', '7:00 p.m. a 9:00 p.m. (hora Perú)',
   '200 HORAS', 'zoom', NULL,
   '(?i)liderazgo\s*pol[ií]tic|curso.*liderazgo|liderazgo.*curso',
   'producto:liderazgo', TRUE, 'system_learn_p4'),

  ('IA-LIDERES', 'Curso de IA para Líderes Políticos',
   '✅ Incluye acceso a las herramientas de IA versión pagada. Aplicaciones prácticas de IA en gestión pública y campaña.',
   300, 90,
   'Sábados', '10:00 a.m. a 12:00 p.m. (hora Perú)',
   '40 HORAS', 'zoom', NULL,
   '(?i)\bia\b\s*para\s*l[ií]deres|ia\s*aplicada\s*a\s*pol[ií]tic',
   'producto:ia-lideres', FALSE, 'system_learn_p4')
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────
-- 2. Actualizar productos existentes con datos REALES del flyer
-- ─────────────────────────────────────────────────────────────────────

-- IA y Marketing — confirmar precio + link real openpay
UPDATE escuela_products SET
  precio_dolares  = 150,
  precio_soles    = 500,
  link_matricula  = 'https://api.openpay.pe/occ/UMYdlmFFNMfR',
  dias_semana     = 'Lunes, Miércoles y Viernes',
  horario         = '6:00 p.m. a 8:00 p.m. (GMT-5)',
  horas_academicas= '120 HORAS',
  descripcion     = '🤖 Diploma Internacional en IA y Marketing Político. Potencia campañas con Inteligencia Artificial. Certificación internacional · 50% teoría – 50% práctica · Clases en vivo aplicadas. Inicio 18 de mayo, cierre de inscripciones 15 mayo.',
  updated_at      = now(),
  updated_by      = 'system_learn_p4'
WHERE sku = 'DIPIAMP006';

-- Director Comunicaciones — agregar link real
UPDATE escuela_products SET
  link_matricula = 'https://api.openpay.pe/occ/xk3g1h74Q43c',
  precio_dolares = 150,
  precio_soles   = 500,
  dias_semana    = 'Martes, Jueves y Sábados',
  horario        = '7:00 p.m. a 9:00 p.m. (GMT-5)',
  horas_academicas = '120 HORAS',
  descripcion    = '🎙️ Diploma Élite "Director de Comunicaciones StratCom". Para directores de comunicaciones políticas y voceros institucionales. Domina el StratCom, comunicación estratégica para campañas y gobierno. 4 semanas, martes-jueves-sábados.',
  updated_at     = now(),
  updated_by     = 'system_learn_p4'
WHERE sku = 'DIPDC150';

-- Gestión Parlamentaria
UPDATE escuela_products SET
  descripcion    = '🎓 Diploma Técnico de Gestión Parlamentaria Bicameral. Para senadores, diputados y equipo Parlamentario que buscan liderazgo y solvencia técnica en el nuevo Congreso Bicameral 2026. Domina el proceso legislativo bicameral.',
  fecha_inicio   = '2026-06-02',
  dias_semana    = 'Martes y Jueves',
  horario        = '7:00 p.m. a 9:00 p.m. (hora Perú)',
  horas_academicas = '200 HORAS',
  precio_soles   = 500,
  precio_dolares = 150,
  updated_at     = now(),
  updated_by     = 'system_learn_p4'
WHERE sku = 'GEN5C2G1';


-- ─────────────────────────────────────────────────────────────────────
-- 3. Cuentas bancarias adicionales (USD para internacionales — Quito, MX)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO bank_accounts (name, body, yape_numero, is_default) VALUES
  ('Goberna — Internacional (USD via OpenPay)',
   E'💳 *PAGO INTERNACIONAL*\n\n*Link OpenPay (acepta tarjetas internacionales):*\nhttps://api.openpay.pe/occ\n\n*Pago directo desde:* Argentina · Chile · México · Colombia · Ecuador · Bolivia · Paraguay · Uruguay · USA · Europa.\n\nEnvíanos tu comprobante de pago para registrarte 📩',
   NULL, FALSE),
  ('Goberna — Wise/Zelle (USA/Europa)',
   E'💸 *Si estás en USA o Europa:*\n\n*Wise · Zelle:* coordinar con asesora.\nLink directo: https://api.openpay.pe/occ',
   NULL, FALSE)
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────
-- 4. Update p4 instance con info real: Kathy + cuenta + prompt
-- ─────────────────────────────────────────────────────────────────────
UPDATE bot_instances SET
  display_name    = 'Goberna Escuela · Kathy',
  agent_name      = 'Kathy',
  agent_signature = 'Kathy Asesora de Goberna',
  cuenta_bancaria = E'🏫 *ESCUELA ACADEMICA GOBERNA EIRL*\n*RUC:* 20608310925\n\n🏦 *BCP*\n🧾 *Cuenta:* 1939936368051\n*CCI:* 00219300993636805115\n\n🏦 *INTERBANK*\n🧾 *Cuenta:* 2003004813730\n*CCI:* 00320000300481373038\n\n*YAPE GOBERNA*\n944531711',
  yape_numero     = '944531711',
  product_skus    = ARRAY['CONSULTOR-POL-2026','LIDERAZGO-POL-2026','GEN5C2G1','DIPIAMP006','DIPDC150','DIPTEEI003','DIPOSOC004','DIPJEOPA002','EPCOOIP017'],
  extra_prompt    = E'Eres *Kathy*, Asesora de Goberna. Atendés leads de Perú, Ecuador, México, Colombia y otros países hispanohablantes. Respondés en español neutro, cálido y profesional. SIEMPRE saludá con tu nombre y tratá de usted al inicio. Cuando te pregunten por inscripción pide los siguientes datos: foto del comprobante, nombres, apellidos, correo, provincia, ciudad, ocupación, DNI. Cuando te pregunten cómo pagar comparte la cuenta bancaria de la instancia. Los precios están en S/ (Perú) y USD (internacional). Para internacionales priorizá el link de OpenPay. NUNCA inventes precios — pediles que confirmen el curso y mencioná solo los precios del catálogo.',
  notes           = 'Producción · Kathy es la asesora principal. p4 = +51944531711. NO ACTIVAR autoreply hasta confirmación del operador.'
WHERE slug = 'p4';

-- p3 → Jahelly (segunda asesora detectada en historial)
UPDATE bot_instances SET
  display_name    = 'Goberna Escuela · Jahelly',
  agent_name      = 'Jahelly',
  agent_signature = 'Jahelly Justiniano, Asesora de Goberna',
  cuenta_bancaria = E'🏫 *ESCUELA ACADEMICA GOBERNA EIRL*\n*RUC:* 20608310925\n\n🏦 *BCP*\n🧾 *Cuenta:* 1939936368051\n*CCI:* 00219300993636805115\n\n*YAPE GOBERNA*\n944531711',
  yape_numero     = '944531711',
  notes           = 'Backup · Jahelly Justiniano (segunda asesora). 13 usos detectados en historial.'
WHERE slug = 'p3';


-- ─────────────────────────────────────────────────────────────────────
-- 5. Prompt override: contexto rico aprendido de p4
-- ─────────────────────────────────────────────────────────────────────
DELETE FROM ai_prompt_override WHERE id = 1;
INSERT INTO ai_prompt_override (id, extra_context, extra_categories, few_shot_examples, enabled, updated_by)
VALUES (1,
  E'Goberna Escuela vende diplomas online de consultoría política, oratoria, marketing político y gestión pública. Está en Lima, Perú, pero atiende toda Latinoamérica.\n\nProductos activos del flyer (orden por demanda real en p4):\n  1. Diploma Internacional Consultor Político — $120 USD / S/400 — el más demandado (69 broadcasts).\n  2. Diploma IA y Marketing Político — $150 USD / S/500 — Inicio 18 mayo, L-X-V 6-8pm GMT-5, 3 semanas.\n  3. Diploma Élite Director Comunicaciones StratCom — $150 USD / S/500 — 4 semanas M-J-Sáb.\n  4. Diploma Técnico Gestión Parlamentaria Bicameral — S/500 / $150 — Inicio 02 junio, M-J 7-9pm Perú, 4 semanas, 200 hrs.\n  5. Diploma Liderazgo Político — S/500 / $150 — M-J 7-9pm.\n  6. Curso Oratoria e Imagen Política — alta demanda.\n  7. Análisis de Inteligencia / OSINT / Operaciones de Inteligencia — para perfiles de seguridad y militares.\n\nFormas de pago Perú: BCP 1939936368051 / Interbank 2003004813730 / Yape 944531711.\nFormas de pago internacional: link OpenPay (acepta tarjetas de toda LATAM + USA).\n\nLeads vienen mayoritariamente de Perú (Lima, Tumbes, Piura, Trujillo), Ecuador (Quito, Guayaquil), México y Colombia. Tratamiento: usted formal al inicio, cálido y profesional.\n\nIntenciones más comunes (medidas en p4):\n  - 18% saludo · 9% gracias · 3.4% pregunta horario · 2.9% pide info · 2% promo · 1.9% pregunta medios pago · 1.3% lead internacional · 1.2% precio.',

  E'producto:consultor_politico\nproducto:liderazgo_politico\nproducto:gestion_parlamentaria\nproducto:ia_marketing\nproducto:director_comunicaciones\nproducto:oratoria\nproducto:analisis_inteligencia\nproducto:osint\nintent:saludo\nintent:agradecimiento\nintent:precio\nintent:horario_fecha\nintent:matricula\nintent:pago_metodos\nintent:pago_realizado\nintent:certificado\nintent:internacional\nintent:no_interesado\nintent:facturacion',

  '[
    {"input": "hola, deseo info del Diploma Técnico de Gestión Parlamentaria Bicameral",
     "output": {"category":"producto:gestion_parlamentaria","intent":"info_curso","confidence":0.95}},
    {"input": "cuanto cuesta el diploma de consultor politico?",
     "output": {"category":"producto:consultor_politico","intent":"precio","confidence":0.92}},
    {"input": "estoy en Quito Ecuador, puedo pagar desde aquí?",
     "output": {"category":"intent:internacional","intent":"pago_metodos","confidence":0.9}},
    {"input": "kathy ya hice el deposito al BCP",
     "output": {"category":"intent:pago_realizado","intent":"pago_realizado","confidence":0.95}},
    {"input": "que día empieza el curso? a qué hora son las clases?",
     "output": {"category":"intent:horario_fecha","intent":"horario_fecha","confidence":0.95}}
  ]'::jsonb,
  TRUE,
  'system_learn_p4');


-- ─────────────────────────────────────────────────────────────────────
-- 6. Stats de cierre
-- ─────────────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM escuela_products) AS productos_total,
  (SELECT count(*) FROM escuela_products WHERE featured) AS productos_featured,
  (SELECT count(*) FROM ai_rules) AS reglas_total,
  (SELECT count(*) FROM templates) AS templates_total,
  (SELECT count(*) FROM bank_accounts) AS cuentas_total,
  (SELECT count(*) FROM bot_instances) AS instancias_total,
  (SELECT count(*) FROM pipeline_stages WHERE enabled) AS stages_activos;

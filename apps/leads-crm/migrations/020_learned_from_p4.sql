-- 020_learned_from_p4.sql
-- Aprende del historial de p4: actualiza productos con datos reales (precios,
-- horarios, modalidades observadas en chats), agrega templates más usados,
-- y crea reglas IA para los patrones más frecuentes detectados.

-- =====================================================================
-- 1. Templates más usados (extraídos de mensajes salientes de Kathy en p4)
-- =====================================================================

-- Si templates no existe la creamos. Si existe, ON CONFLICT manda.
CREATE TABLE IF NOT EXISTS templates (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  body         TEXT NOT NULL,
  image_url    TEXT,
  category     TEXT DEFAULT 'general',
  uses_count   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add category column if not exists
ALTER TABLE templates ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE templates ADD COLUMN IF NOT EXISTS uses_count INT NOT NULL DEFAULT 0;

INSERT INTO templates (name, body, category, uses_count) VALUES

  ('saludo_kathy', E'👋¡Hola, buenos días! te saluda *Kathy Asesora de Goberna*. En seguida te comparto la información sobre el {{curso}}', 'saludo', 32),

  ('saludo_goberna_general', E'¡Hola! 👋 Gracias por comunicarte con *Goberna*.\n\nSomos especialistas en formación política y desarrollo profesional. ¿En qué podemos ayudarte?\n\n📚 Oratoria · 🎓 Consultoría Política · 🧠 Inteligencia Emocional · 📊 Marketing Político · 🏆 Liderazgo', 'saludo', 38),

  ('datos_para_registro', E'💪Para ayudarte con tu inscripción me confirmas los siguientes datos:\n🖊️ *DATOS PARA EL REGISTRO*\n✅ Foto de comprobante de pago:\n✅ Nombre(s):\n✅ Apellidos:\n✅ Correo:\n✅ Provincia:\n✅ Ciudad:\n✅ Ocupación:\n✅ DNI:', 'inscripcion', 26),

  ('medios_de_pago', E'*EL PAGO LO PUEDE REALIZAR*\n🇵🇪 *Mediante depósito o transferencia a las cuentas corrientes de la empresa:*\n🏫 *ESCUELA ACADEMICA GOBERNA EIRL*\n*RUC:* 20608310925\n\n🏦 *BANCO BCP*\n🧾 *Cuenta:* 1939936368051\n*CCI:* 00219300993636805115\n\n🏦 *BANCO INTERBANK*\n🧾 *Cuenta:* 2003004813730\n*CCI:* 00320000300481373038\n\n*YAPE GOBERNA*\n944531711', 'pago', 24),

  ('diploma_3_semanas', E'El diploma dura 3 semanas de clases en vivo mediante la plataforma zoom y también quedan grabadas y se suben al campus virtual. Como alumno tendrá acceso a la plataforma para que pueda revisar las clases. *Las clases serán los días lunes, miércoles y viernes*', 'info_curso', 24),

  ('diploma_4_semanas', E'El diploma dura 4 semanas de clases en vivo mediante la plataforma zoom y también quedan grabadas y se suben al campus virtual. Como alumno tendrá acceso a la plataforma para que pueda revisar las clases. *Las clases serán los días martes, jueves y sábados*', 'info_curso', 40),

  ('cierre_inscripciones_hoy', E'Hola buen día😊. Te comento que *Mañana cerramos las inscripciones para {{curso}}*. ¿Confirmas tu cupo? 🎓', 'urgencia', 22),

  ('seguimiento_revision', E'Hola buenas tardes, mucho gusto. ¿Ha podido revisar la información enviada sobre el Diploma? 🙂', 'seguimiento', 45),

  ('flyer_ia_marketing', E'*🆘 NUEVA EDICIÓN🆘*\n*🤖 DIPLOMA INTERNACIONAL EN IA Y MARKETING POLÍTICO 💡*\n*¿Quieres potenciar tus estrategias de campaña con Inteligencia Artificial?*\n*✨ Beneficios únicos:*\n✅ Certificación internacional 📜\n✅ 50% teoría – 50% práctica\n✅ Clases en vivo con enfoque práctico y aplicado 🎓\n\n*📅 Inicio:* 18 DE MAYO\n*🕕 Horario:* 6:00 PM – 8:00 PM (GMT-5)\n*💻 Modalidad:* Online en vivo – vía ZOOM\n_Lunes, miércoles y viernes x 3 semanas_\n\n*💲 Inversión: $150 USD*\n*Link de pago:* https://api.openpay.pe/occ/UMYdlmFFNMfR\n_Cierre de inscripciones 15 de mayo_', 'flyer', 76),

  ('flyer_director_comunicaciones', E'*Diploma Élite DIRECTOR DE COMUNICACIONES, pensado para:*\n\n*📍 Online*\n📆 JUEVES 23 DE ABRIL\n⏰ 19:00 – 21:00 (GMT-5)\n⏳ 4 semanas, se dicta los martes, jueves y sábados\nAl aprobar el programa final obtienes el *Diploma de "Director de Comunicaciones StratCom".*\n\n*💰Precio especial $150 Dólares*\n¿Te ayudo con tu inscripción?', 'flyer', 40),

  ('canal_invitacion', E'Te comparto el canal para que puedas unirte ☺️\nhttps://whatsapp.com/channel/0029Va6Bjmi9Gv7QKGfV1546', 'canal', 31),

  ('hoy_iniciamos_clases', E'*2️⃣❌1️⃣ HOY INICIAMOS CLASES*\nBuen día, te comento que el *HOY INICIAMOS EL DIPLOMA*. Por tu inscripción recibe de regalo un curso adicional por el mismo precio. ¿Te encuentras interesado en proceder con tu inscripción? *ÚLTIMAS 3 VACANTES* 🆘\nEspero tu respuesta 😊', 'urgencia', 69)

ON CONFLICT (name) DO UPDATE SET
  body = EXCLUDED.body,
  category = EXCLUDED.category,
  uses_count = EXCLUDED.uses_count,
  updated_at = now();


-- =====================================================================
-- 2. Productos: corregir precios + descripciones con datos reales del flyer
-- =====================================================================

-- IA y Marketing Político: realmente cobran $150 USD (no $135), L-X-V x 3 semanas
UPDATE escuela_products SET
  precio_dolares  = 150,
  precio_soles    = 500,
  dias_semana     = 'Lunes, Miércoles y Viernes',
  horario         = '6:00 p.m. a 8:00 p.m. (GMT-5)',
  horas_academicas= '120 HORAS',
  link_matricula  = 'https://api.openpay.pe/occ/UMYdlmFFNMfR',
  descripcion     = '🤖 Diploma Internacional en IA y Marketing Político. Potencia tus estrategias de campaña con Inteligencia Artificial. Certificación internacional · 50% teoría – 50% práctica · Clases en vivo aplicadas.',
  updated_at      = now(),
  updated_by      = 'system_learn_p4'
WHERE sku = 'DIPIAMP006';

-- Gestión Parlamentaria: precio real preventa S/ 500 ($150), 4 semanas, MJ
UPDATE escuela_products SET
  precio_dolares  = 199,
  precio_soles    = 500,
  dias_semana     = 'Martes y Jueves',
  horario         = '7:00 p.m. a 9:00 p.m. (hora Perú)',
  horas_academicas= '200 HORAS',
  descripcion     = '🎓 Diploma Técnico de Gestión Parlamentaria Bicameral. Para senadores, diputados y equipo Parlamentario que buscan liderazgo y solvencia técnica en el nuevo Congreso Bicameral 2026. Aprende a dominar el proceso legislativo bicameral.',
  updated_at      = now(),
  updated_by      = 'system_learn_p4'
WHERE sku = 'GEN5C2G1';


-- 7º producto que apareció en historial pero no estaba seedeado:
-- "Director de Comunicaciones StratCom"
INSERT INTO escuela_products
  (sku, nombre, descripcion, precio_soles, precio_dolares,
   dias_semana, horario, horas_academicas, modalidad,
   classifier_pattern, classifier_tag, featured, created_by)
VALUES (
  'DIPDC150',
  'Diploma Élite Director de Comunicaciones StratCom',
  'Diploma Élite para directores de comunicaciones políticas. Domina el StratCom, comunicación estratégica para campañas y gobierno. 4 semanas, martes-jueves-sábados.',
  500, 150,
  'Martes, Jueves y Sábados',
  '7:00 p.m. a 9:00 p.m. (GMT-5)',
  '120 HORAS',
  'zoom',
  '(?i)director\s*de\s*comunicaci|stratcom|comunicac.*estrat[eé]gic',
  'interés:director-comunicaciones',
  TRUE,
  'system_learn_p4'
) ON CONFLICT DO NOTHING;


-- =====================================================================
-- 3. Reglas IA para patrones detectados en p4 (frecuentes en mensajes IN)
-- =====================================================================

INSERT INTO ai_rules (name, pattern, tag, weight, enabled, source) VALUES

  -- Saludos (23% de mensajes IN) — tag para enrutamiento + saludo automático
  ('intent:saludo', '(?i)\b(hola|buen[oa]s?\s*d[ií]as?|buen[oa]s?\s*tardes?|buen[oa]s?\s*noches?|hey)\b', 'intent:saludo', 0.5, TRUE, 'learned_p4'),

  -- Agradecimiento (7%)
  ('intent:agradecimiento', '(?i)\b(gracias|muchas\s*gracias|te\s*agradezco|agradezco)\b', 'intent:agradecimiento', 0.4, TRUE, 'learned_p4'),

  -- Pregunta de precio
  ('intent:precio', '(?i)\b(precio|costo|cu[aá]nto\s*(cuesta|vale|sale|es)|inversi[oó]n|cu[aá]nto)\b', 'intent:precio', 0.9, TRUE, 'learned_p4'),

  -- Pregunta de horario / días / fecha de inicio
  ('intent:horario_fecha', '(?i)\b(horario|que\s*hora|d[ií]as|cu[aá]ndo\s*(empieza|inicia|comienza)|fecha\s*de\s*inicio|cu[aá]nto\s*dura)\b', 'intent:horario_fecha', 0.9, TRUE, 'learned_p4'),

  -- Pregunta de modalidad / zoom / grabadas
  ('intent:modalidad', '(?i)\b(zoom|presencial|virtual|en\s*vivo|grabad[ao]s?|modalidad|c[oó]mo\s*es\s*la\s*clase|campus\s*virtual|plataforma)\b', 'intent:modalidad', 0.8, TRUE, 'learned_p4'),

  -- Quiere matricularse
  ('intent:matricula', '(?i)\b(matr[ií]cul|inscrib|me\s*apunto|me\s*inscrib|inscripci[oó]n)\b', 'intent:matricula', 1.0, TRUE, 'learned_p4'),

  -- Comprobante de pago / quiere pagar
  ('intent:pago', '(?i)\b(comprobante|yape|deposito|transferencia|cuenta\s*bancaria|c[oó]mo\s*pago|pagar|medios\s*de\s*pago)\b', 'intent:pago', 1.0, TRUE, 'learned_p4'),

  -- Pregunta certificado físico
  ('intent:certificado', '(?i)\b(certificado\s*f[ií]sico|diploma\s*f[ií]sico|certificaci[oó]n|recib[oó]\s*el\s*diploma)\b', 'intent:certificado', 0.8, TRUE, 'learned_p4'),

  -- Examen / nota / aprobación (alumnos actuales)
  ('intent:examen_nota', '(?i)\b(examen|notas?|calificaci[oó]n|aprob|reprob|tarea)\b', 'intent:examen_nota', 0.7, TRUE, 'learned_p4'),

  -- Acceso al campus / no puede entrar (soporte técnico)
  ('intent:soporte_acceso', '(?i)\b(no\s*puedo\s*entrar|no\s*puedo\s*acceder|olvid[eé]\s*(mi|la)\s*contrase|usuario\s*y\s*contrase|c[oó]mo\s*ingreso|c[oó]mo\s*entro|recuper.*contrase)\b', 'intent:soporte_acceso', 0.9, TRUE, 'learned_p4'),

  -- No interesado (negative intent)
  ('intent:no_interesado', '(?i)\b(no\s*me\s*interesa|no\s*gracias|no\s*por\s*ahora|otro\s*momento|no\s*estoy\s*interesad)\b', 'intent:no_interesado', 1.0, TRUE, 'learned_p4'),

  -- Información sobre comunidad / canal
  ('intent:canal_comunidad', '(?i)\b(canal|comunidad|grupo|c[oó]mo\s*me\s*uno)\b', 'intent:canal_comunidad', 0.6, TRUE, 'learned_p4')

ON CONFLICT DO NOTHING;


-- =====================================================================
-- 4. Stats post-import
-- =====================================================================

SELECT 'templates' AS tabla, count(*) FROM templates
UNION ALL SELECT 'productos featured', count(*)::text FROM escuela_products WHERE featured = TRUE
UNION ALL SELECT 'ai_rules total', count(*)::text FROM ai_rules
UNION ALL SELECT 'ai_rules learned_p4', count(*)::text FROM ai_rules WHERE source = 'learned_p4'
UNION ALL SELECT 'ai_rules product', count(*)::text FROM ai_rules WHERE source = 'product';

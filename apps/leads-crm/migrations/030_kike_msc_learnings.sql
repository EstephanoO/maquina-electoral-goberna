-- 030_kike_msc_learnings.sql
-- Aprendizajes del análisis 2026-05-06 sobre conversaciones Kike y MSC:
--   * Kathy también vende libro físico "El Poder de la Oratoria" desde la
--     oficina de México (Río Tiber 100).
--   * Goberna tiene oficina física en CDMX (info nueva).
--   * Existe flujo "constancia/diploma físico en imprenta" — seguimiento
--     post-curso que el bot debe poder informar.
--   * Existe Diploma Técnico de Especialización (S/400) — distinto de los
--     diplomas internacionales ($120-150).
--   * Frase de cierre Kathy: "¿Procedemos con tu inscripción ahora?".

-- ── Templates nuevos ────────────────────────────────────────────────
INSERT INTO templates (name, body, category, uses_count, media_kind) VALUES
  ('direccion_oficina_mexico',
   E'📍 *Oficina Goberna México*\nRío Tiber 100, col. Cuauhtémoc, Piso 6\nCiudad de México\n\nLunes a Viernes · 10am – 6pm.\nLe pido me confirme con anticipación cuándo viene para tener el material listo 🙏',
   'direccion', 0, 'text'),

  ('libro_oratoria_fisico',
   E'📚 *El Poder de la Oratoria*\n_Libro físico de Edwards Infante_\n\n💰 *Precio:* S/. 80 + envío\n📦 Disponible en oficina (México y Perú) o por delivery.\n\nSi quieres reservarlo me confirmas tu ciudad y te paso los detalles 🙂',
   'libro', 0, 'text'),

  ('tracking_constancia',
   E'¡Hola! 👋 Te comento que tu constancia/diploma ya está en *imprenta*. Apenas esté lista te aviso para coordinar el envío o recojo.\n\nGracias por la paciencia 🙏',
   'tracking', 0, 'text'),

  ('cierre_procedemos',
   E'*¿Procedemos con tu inscripción ahora?* 🎓',
   'urgencia', 0, 'text'),

  ('confirmacion_inscripcion_recibida',
   E'¡Listo, Enrique! 🎉 Recibimos tu comprobante. Te confirmaré por aquí cuando esté procesada tu matrícula y te llegue el correo de bienvenida del campus.\n\n_¡Bienvenido a Goberna!_',
   'confirmacion', 0, 'text'),

  ('diploma_tecnico_especializacion_400',
   E'*🎓 DIPLOMA TÉCNICO DE ESPECIALIZACIÓN*\n💰 *Inversión:* S/. 400 soles\n📅 Próximo inicio: por confirmar\n💻 Modalidad: Zoom en vivo\n📜 Certificación oficial\n\n¿Quieres más información del temario?',
   'flyer', 0, 'text'),

  ('seguimiento_proximo_curso',
   E'Si no llegamos a tiempo para este inicio, no te preocupes 😊. Tenemos otros cursos en agenda y te puedo avisar apenas abramos un nuevo grupo. Solo confirmame qué tema te interesa más 🙂',
   'seguimiento', 0, 'text')
ON CONFLICT (name) DO UPDATE SET
  body = EXCLUDED.body,
  category = EXCLUDED.category,
  media_kind = EXCLUDED.media_kind,
  updated_at = now();


-- ── Producto: Libro físico ─────────────────────────────────────────
INSERT INTO escuela_products
  (sku, nombre, descripcion, precio_soles, precio_dolares,
   modalidad, classifier_pattern, classifier_tag, featured, created_by)
VALUES
  ('LIBRO-ORATORIA',
   'Libro: El Poder de la Oratoria',
   '📚 Libro físico de Edwards Infante. Disponible en oficina Goberna (México y Perú) o por delivery. S/.80 + envío.',
   80, 25,
   'fisico',
   '(?i)libro.*oratoria|el\s*poder\s*de\s*la\s*oratoria|comprar.*libro',
   'producto:libro-oratoria', FALSE, 'system_learn_p4_kike')
ON CONFLICT DO NOTHING;


-- ── Reglas IA nuevas (intents detectados en Kike + MSC) ────────────
INSERT INTO ai_rules (name, pattern, tag, weight, enabled, source) VALUES
  ('intent:tracking_constancia',
   '(?i)\b(seguimiento|constancia|diploma\s*f[ií]sico|cuando\s*estar[aá]\s*listo|tracking|imprenta)\b',
   'intent:tracking_constancia', 0.9, TRUE, 'learned_p4_kike'),

  ('intent:direccion_oficina',
   '(?i)\b(direcci[oó]n|d[oó]nde\s*est[aá]n\s*ubicad|oficina|lugar\s*de\s*recojo|ad[oó]nde\s*acudir)\b',
   'intent:direccion_oficina', 0.95, TRUE, 'learned_p4_msc'),

  ('intent:libro_fisico',
   '(?i)\b(libro|poder\s*de\s*la\s*oratoria|comprar.*libro|libro.*f[ií]sico)\b',
   'producto:libro-oratoria', 1.0, TRUE, 'learned_p4_kike'),

  ('intent:cliente_recurrente',
   '(?i)\b(otra\s*vez|nuevamente|de\s*nuevo|pr[oó]ximo\s*curso|cuando\s*sigue|otro\s*diploma)\b',
   'intent:cliente_recurrente', 0.8, TRUE, 'learned_p4_kike')

ON CONFLICT DO NOTHING;


-- ── Prompt override: agregar info de oficinas + libros ─────────────
UPDATE ai_prompt_override SET
  extra_context = extra_context || E'\n\nOFICINAS:\n- México: Río Tiber 100 col. Cuauhtémoc, Piso 6 - CDMX. L-V 10am-6pm.\n- Perú: por confirmar.\n\nLIBROS FÍSICOS:\n- "El Poder de la Oratoria" de Edwards Infante — S/.80 + envío.\n\nFLUJO POST-COMPRA:\n- Las constancias/diplomas físicos van a imprenta y se entregan después.\n- Si lead pregunta por su constancia → derivar a operador (atención humana).\n\nCLIENTES RECURRENTES:\n- Si el lead ya compró antes (escuela_client_id IS NOT NULL), saludarlo personalizado, NO mandar el saludo genérico.',
  updated_at = now(),
  updated_by = 'system_learn_p4_kike_msc'
WHERE id = 1;


SELECT
  (SELECT count(*) FROM templates) AS templates,
  (SELECT count(*) FROM escuela_products) AS productos,
  (SELECT count(*) FROM ai_rules) AS reglas;

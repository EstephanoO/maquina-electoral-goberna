-- 021_templates_seed.sql
-- Add unique on templates.name + seed top templates from p4 history.

CREATE UNIQUE INDEX IF NOT EXISTS templates_name_key ON templates(name);

INSERT INTO templates (name, body, category, uses_count) VALUES
  ('saludo_kathy', E'👋¡Hola, buenos días! te saluda *Kathy Asesora de Goberna*. En seguida te comparto la información sobre el {{curso}}', 'saludo', 32),
  ('saludo_goberna_general', E'¡Hola! 👋 Gracias por comunicarte con *Goberna*.\n\nSomos especialistas en formación política y desarrollo profesional. ¿En qué podemos ayudarte?\n\n📚 Oratoria · 🎓 Consultoría Política · 🧠 Inteligencia Emocional · 📊 Marketing Político · 🏆 Liderazgo', 'saludo', 38),
  ('datos_para_registro', E'💪Para ayudarte con tu inscripción me confirmas los siguientes datos:\n🖊️ *DATOS PARA EL REGISTRO*\n✅ Foto de comprobante de pago:\n✅ Nombre(s):\n✅ Apellidos:\n✅ Correo:\n✅ Provincia:\n✅ Ciudad:\n✅ Ocupación:\n✅ DNI:', 'inscripcion', 26),
  ('medios_de_pago', E'*EL PAGO LO PUEDE REALIZAR*\n🇵🇪 *Mediante depósito o transferencia a las cuentas corrientes de la empresa:*\n🏫 *ESCUELA ACADEMICA GOBERNA EIRL*\n*RUC:* 20608310925\n\n🏦 *BANCO BCP*\n🧾 *Cuenta:* 1939936368051\n*CCI:* 00219300993636805115\n\n🏦 *BANCO INTERBANK*\n🧾 *Cuenta:* 2003004813730\n*CCI:* 00320000300481373038\n\n*YAPE GOBERNA*\n944531711', 'pago', 24),
  ('diploma_3_semanas', E'El diploma dura 3 semanas de clases en vivo mediante la plataforma zoom y también quedan grabadas y se suben al campus virtual. Como alumno tendrá acceso a la plataforma para que pueda revisar las clases. *Las clases serán los días lunes, miércoles y viernes*', 'info_curso', 24),
  ('diploma_4_semanas', E'El diploma dura 4 semanas de clases en vivo mediante la plataforma zoom y también quedan grabadas y se suben al campus virtual. Como alumno tendrá acceso a la plataforma para que pueda revisar las clases. *Las clases serán los días martes, jueves y sábados*', 'info_curso', 40),
  ('cierre_inscripciones_hoy', E'Hola buen día😊. Te comento que *Mañana cerramos las inscripciones para {{curso}}*. ¿Confirmas tu cupo? 🎓', 'urgencia', 22),
  ('seguimiento_revision', E'Hola buenas tardes, mucho gusto. ¿Ha podido revisar la información enviada sobre el Diploma? 🙂', 'seguimiento', 45),
  ('flyer_ia_marketing', E'*🆘 NUEVA EDICIÓN🆘*\n*🤖 DIPLOMA INTERNACIONAL EN IA Y MARKETING POLÍTICO 💡*\n\n*✨ Beneficios únicos:*\n✅ Certificación internacional 📜\n✅ 50% teoría – 50% práctica\n✅ Clases en vivo con enfoque práctico y aplicado 🎓\n\n*📅 Inicio:* 18 DE MAYO\n*🕕 Horario:* 6:00 PM – 8:00 PM (GMT-5)\n*💻 Modalidad:* Online en vivo – vía ZOOM\n_Lunes, miércoles y viernes x 3 semanas_\n\n*💲 Inversión: $150 USD*\n*Link de pago:* https://api.openpay.pe/occ/UMYdlmFFNMfR\n_Cierre de inscripciones 15 de mayo_', 'flyer', 76),
  ('flyer_director_comunicaciones', E'*Diploma Élite DIRECTOR DE COMUNICACIONES, pensado para:*\n\n*📍 Online*\n📆 4 semanas, se dicta los martes, jueves y sábados\n⏰ 19:00 – 21:00 (GMT-5)\nAl aprobar el programa final obtienes el *Diploma de "Director de Comunicaciones StratCom".*\n\n*💰Precio especial $150 Dólares*\n¿Te ayudo con tu inscripción?', 'flyer', 40),
  ('canal_invitacion', E'Te comparto el canal para que puedas unirte ☺️\nhttps://whatsapp.com/channel/0029Va6Bjmi9Gv7QKGfV1546', 'canal', 31),
  ('hoy_iniciamos_clases', E'*2️⃣❌1️⃣ HOY INICIAMOS CLASES*\nBuen día, te comento que el *HOY INICIAMOS EL DIPLOMA*. Por tu inscripción recibe de regalo un curso adicional por el mismo precio. ¿Te encuentras interesado en proceder con tu inscripción? *ÚLTIMAS 3 VACANTES* 🆘\nEspero tu respuesta 😊', 'urgencia', 69)
ON CONFLICT (name) DO UPDATE SET
  body = EXCLUDED.body,
  category = EXCLUDED.category,
  uses_count = EXCLUDED.uses_count,
  updated_at = now();

SELECT count(*) AS templates_total, sum(uses_count) AS total_usos_historicos FROM templates;

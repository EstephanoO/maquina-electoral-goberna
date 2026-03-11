-- 040_audio_catalog_dynamic_categories.sql
-- Dynamic categories for audio catalog + new César Vásquez scripts.
-- Categories are now stored in a DB table instead of hardcoded enum.

-- ── Categories table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audio_catalog_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,          -- e.g. 'cuando_llaman', 'impulsar_canal'
  label       TEXT NOT NULL,          -- Display name
  icon        TEXT NOT NULL DEFAULT 'default', -- Icon key for the extension panel
  color       TEXT NOT NULL DEFAULT '#8696a0', -- Accent color hex
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, key)
);

CREATE INDEX IF NOT EXISTS idx_audio_catalog_categories_campaign
  ON audio_catalog_categories (campaign_id, sort_order);

-- ── Seed categories for César Vásquez campaign ──────────────────────
INSERT INTO audio_catalog_categories (campaign_id, key, label, icon, color, sort_order) VALUES
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'saludo',              'Saludo',               'saludo',             '#00a884', 1),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'cuando_llaman',       'Cuando llaman',        'phone',              '#38bdf8', 2),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'impulsar_canal',      'Impulsar canal',       'megaphone',          '#f59e0b', 3),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'agendar',             'Agendar contacto',     'contact',            '#818cf8', 4),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'apoyo_historico',     'Apoyo histórico',      'agradecimiento',     '#ef5350', 5),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'opiniones',           'Opinan / proponen',    'propuestas',         '#34d399', 6),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'pedir_apoyo',         'Pedir apoyo',          'pedir_voto',         '#fbbf24', 7),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'compartir_canal',     'Compartir canal',      'share',              '#c084fc', 8),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'saludos',             'Saludos recibidos',    'saludo',             '#00a884', 9),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'cerrar_conv',         'Cerrar conversación',  'despedida',          '#a78bfa', 10),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'compartir_mensaje',   'Compartir mensaje',    'share',              '#f97316', 11),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'mantener_contacto',   'Mantener comunicación','contact',            '#06b6d4', 12),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'responder_opiniones', 'Responder opiniones',  'propuestas',         '#10b981', 13),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'agradecimiento',      'Agradecimiento',       'agradecimiento',     '#ef5350', 14),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'pedir_voto',          'Pedir voto',           'pedir_voto',         '#f59e0b', 15),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'respuesta_trabajo',   'Respuesta trabajo',    'respuesta_trabajo',  '#818cf8', 16),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'respuesta_dinero',    'Respuesta dinero',     'respuesta_dinero',   '#34d399', 17),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'invitacion_evento',   'Invitación a evento',  'invitacion_evento',  '#38bdf8', 18),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'despedida',           'Despedida',            'despedida',          '#c084fc', 19),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'propuestas',          'Propuestas',           'propuestas',         '#fbbf24', 20)
ON CONFLICT (campaign_id, key) DO NOTHING;

-- ── New audio items for the 12 new scripts ──────────────────────────
-- 1. Cuando llaman (2 variants)
INSERT INTO audio_catalog (campaign_id, category, label, description, script_text, sort_order) VALUES
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'cuando_llaman',
   'Cuando llaman - Hermano',
   'Respuesta automática cuando llaman y no puedes contestar (masculino)',
   'Hermano, ¿qué tal? ahora no puedo responder pero escríbeme y en un rato te contesto',
   1),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'cuando_llaman',
   'Cuando llaman - Estimada',
   'Respuesta automática cuando llaman y no puedes contestar (femenino)',
   'Estimada, ¿qué tal? ahora no puedo responder, pero escríbeme y en un rato te contesto',
   2)
ON CONFLICT DO NOTHING;

-- 2. Impulsar canal (2 variants)
INSERT INTO audio_catalog (campaign_id, category, label, description, script_text, sort_order) VALUES
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'impulsar_canal',
   'Impulsar canal - Amigo',
   'Invitar a unirse al canal de WhatsApp (masculino)',
   'Amigo, ¿ya te uniste a mi canal de WhatsApp? Súmate para no perderte de las novedades',
   1),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'impulsar_canal',
   'Impulsar canal - Amiga',
   'Invitar a unirse al canal de WhatsApp (femenino)',
   'Amiga, ¿ya te uniste a mi canal de WhatsApp? Súmate para no perderte de las novedades',
   2)
ON CONFLICT DO NOTHING;

-- 3. Agendar contacto (2 variants)
INSERT INTO audio_catalog (campaign_id, category, label, description, script_text, sort_order) VALUES
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'agendar',
   'Agendar - Amigo',
   'Pedir que guarden el contacto (masculino)',
   'Amigo, no te olvides de guardarme en tus contactos para seguir en comunicación',
   1),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'agendar',
   'Agendar - Estimada',
   'Pedir que guarden el contacto (femenino)',
   'Estimada, no te olvides de guardarme en tus contactos para seguir en comunicación',
   2)
ON CONFLICT DO NOTHING;

-- 4. Apoyo histórico (1 script)
INSERT INTO audio_catalog (campaign_id, category, label, description, script_text, sort_order) VALUES
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'apoyo_historico',
   'Agradecer apoyo histórico',
   'Para personas que llevan años apoyando',
   '¡Quiero agradecerte por tu compromiso y respaldo todo este tiempo! Seguimos trabajando por más oportunidades y progreso.',
   1)
ON CONFLICT DO NOTHING;

-- 5. Cuando opinan o proponen (2 variants)
INSERT INTO audio_catalog (campaign_id, category, label, description, script_text, sort_order) VALUES
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'opiniones',
   'Opinan/proponen - Hermano',
   'Responder cuando opinan o proponen (masculino)',
   'Hermano, gracias por tu opinión. Escuchar a nuestra gente siempre es clave para seguir construyendo progreso en el país.',
   1),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'opiniones',
   'Opinan/proponen - Estimada',
   'Responder cuando opinan o proponen (femenino)',
   'Estimada, gracias por tu opinión. Escuchar a nuestra gente siempre es clave para seguir construyendo progreso en el país.',
   2)
ON CONFLICT DO NOTHING;

-- 6. Pedir apoyo en campaña (2 variants)
INSERT INTO audio_catalog (campaign_id, category, label, description, script_text, sort_order) VALUES
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'pedir_apoyo',
   'Pedir apoyo - Amigo',
   'Solicitar apoyo activo en campaña (masculino)',
   'Amigo, contamos con tu apoyo y experiencia en esta etapa. ¡Sigamos trabajando juntos!',
   1),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'pedir_apoyo',
   'Pedir apoyo - Estimada',
   'Solicitar apoyo activo en campaña (femenino)',
   'Estimada, contamos con tu apoyo y experiencia en esta etapa. ¡Sigamos trabajando juntos!',
   2)
ON CONFLICT DO NOTHING;

-- 7. Compartir canal (2 variants)
INSERT INTO audio_catalog (campaign_id, category, label, description, script_text, sort_order) VALUES
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'compartir_canal',
   'Compartir canal - Amigo',
   'Pedir que compartan el canal con conocidos (masculino)',
   'Amigo, comparte el canal con tus amigos y familiares. Toda ayuda suma y nos permite llegar a más personas con nuestras propuestas.',
   1),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'compartir_canal',
   'Compartir canal - Estimada',
   'Pedir que compartan el canal con conocidos (femenino)',
   'Estimada, comparte el canal con tus amigos y familiares. Toda ayuda suma y nos permite llegar a más personas con nuestras propuestas.',
   2)
ON CONFLICT DO NOTHING;

-- 8. Cuando mandan saludos (1 script)
INSERT INTO audio_catalog (campaign_id, category, label, description, script_text, sort_order) VALUES
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'saludos',
   'Responder saludos',
   'Cuando mandan saludos',
   '¡Muchas gracias por el saludo! Un abrazo grande. Nos estamos encontrando pronto.',
   1)
ON CONFLICT DO NOTHING;

-- 9. Cerrar conversación (1 script)
INSERT INTO audio_catalog (campaign_id, category, label, description, script_text, sort_order) VALUES
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'cerrar_conv',
   'Cerrar conversación',
   'Para despedirse y cerrar la conversación',
   'Muchas gracias por escribirme, no te olvides de guardar mi número. ¡Sigamos en contacto!',
   1)
ON CONFLICT DO NOTHING;

-- 10. Compartir mensaje (1 script)
INSERT INTO audio_catalog (campaign_id, category, label, description, script_text, sort_order) VALUES
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'compartir_mensaje',
   'Compartir mensaje',
   'Pedir que compartan el mensaje',
   'Comparte el mensaje con tus amigos y familiares. Ayúdame a que más personas conozcan nuestras propuestas.',
   1)
ON CONFLICT DO NOTHING;

-- 11. Mantener comunicación (2 variants)
INSERT INTO audio_catalog (campaign_id, category, label, description, script_text, sort_order) VALUES
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'mantener_contacto',
   'Mantener contacto - Hermano',
   'Seguir en contacto para actividades del partido (masculino)',
   'Hermano, sigamos en contacto para coordinar las próximas actividades y seguir fortaleciendo el trabajo del partido.',
   1),
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'mantener_contacto',
   'Mantener contacto - Estimada',
   'Seguir en contacto para actividades del partido (femenino)',
   'Estimada amiga, sigamos en contacto para coordinar las próximas actividades y seguir fortaleciendo el trabajo del partido.',
   2)
ON CONFLICT DO NOTHING;

-- 12. Responder opiniones (1 script)
INSERT INTO audio_catalog (campaign_id, category, label, description, script_text, sort_order) VALUES
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'responder_opiniones',
   'Responder opiniones',
   'Agradecer comentarios y opiniones',
   'Gracias por tu comentario. Escuchar a la gente siempre es importante para seguir construyendo propuestas que realmente ayuden al país.',
   1)
ON CONFLICT DO NOTHING;

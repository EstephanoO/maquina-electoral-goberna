-- 039_audio_catalog.sql
-- Pre-generated audio catalog for reusable voice messages (César Vásquez cloned voice).
-- Audios are generated once via ElevenLabs TTS and stored as base64 OGG.
-- Operators pick from the catalog instead of generating TTS per message.

CREATE TABLE IF NOT EXISTS audio_catalog (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,           -- e.g. 'saludo', 'agradecimiento', 'pedir_voto'
  label         TEXT NOT NULL,           -- Display name for operators
  description   TEXT NOT NULL DEFAULT '',-- Short description of when to use
  script_text   TEXT NOT NULL,           -- The text that was (or will be) spoken
  audio_base64  TEXT,                    -- Base64 OGG opus audio (NULL = not yet generated)
  mime_type     TEXT NOT NULL DEFAULT 'audio/ogg; codecs=opus',
  audio_size    INTEGER DEFAULT 0,       -- Size in bytes
  duration_ms   INTEGER DEFAULT 0,       -- Duration estimate in ms
  voice_id      TEXT NOT NULL DEFAULT 'iaSdolcffUuIlEi5pdbj', -- ElevenLabs voice ID
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audio_catalog_campaign_active
  ON audio_catalog (campaign_id, is_active, sort_order);

-- Seed default catalog for César Vásquez campaign
INSERT INTO audio_catalog (campaign_id, category, label, description, script_text, sort_order) VALUES
  ('eece49d5-a315-4764-83f9-681cabae5c51', 'saludo',
   'Saludo inicial',
   'Primer contacto — presentacion del doctor',
   'Hola, buenas tardes. Habla el doctor César Vásquez. Quiero saludarte personalmente y agradecerte por tu tiempo. Estamos trabajando para construir un mejor futuro para todos los peruanos. Cuéntame, en qué te puedo ayudar?',
   1),

  ('eece49d5-a315-4764-83f9-681cabae5c51', 'agradecimiento',
   'Agradecimiento por apoyo',
   'Para votantes duros que ya confirmaron apoyo',
   'Muchas gracias por tu apoyo y tu confianza. De verdad lo valoro mucho. Personas como tú son las que hacen la diferencia. Vamos a seguir trabajando juntos para sacar adelante nuestro país. Cuento contigo!',
   2),

  ('eece49d5-a315-4764-83f9-681cabae5c51', 'pedir_voto',
   'Pedido de apoyo',
   'Para votantes flotantes o indecisos',
   'Te pido que me des la oportunidad de demostrar con hechos lo que podemos hacer juntos. Conozco los problemas de nuestra gente porque los he vivido. Si me das tu confianza, no te voy a defraudar. Vamos con todo!',
   3),

  ('eece49d5-a315-4764-83f9-681cabae5c51', 'respuesta_trabajo',
   'Respuesta a pedido de trabajo',
   'Cuando piden empleo — redirigir sin prometer',
   'Entiendo tu situación y sé lo difícil que es. Lamentablemente no puedo ofrecer puestos de trabajo directamente, pero estamos trabajando en propuestas concretas para generar empleo en todo el país. Te invito a seguir nuestras redes para estar al tanto de las oportunidades que vamos a crear.',
   4),

  ('eece49d5-a315-4764-83f9-681cabae5c51', 'respuesta_dinero',
   'Respuesta a pedido de dinero',
   'Cuando piden Yape/transferencia — declinar amablemente',
   'Comprendo tu necesidad y me da mucha pena no poder ayudarte directamente con ese tema. Como candidato, mi compromiso es trabajar por políticas que mejoren la economía de todas las familias peruanas. Espero poder contar con tu apoyo y juntos vamos a salir adelante.',
   5),

  ('eece49d5-a315-4764-83f9-681cabae5c51', 'invitacion_evento',
   'Invitacion a evento',
   'Invitar a reunion o evento de campana',
   'Quiero invitarte personalmente a nuestro próximo evento. Va a ser una oportunidad para conversar directamente, escuchar tus propuestas y contarte nuestros planes. Tu presencia es muy importante para nosotros. Te esperamos!',
   6),

  ('eece49d5-a315-4764-83f9-681cabae5c51', 'despedida',
   'Despedida y cierre',
   'Para cerrar una conversacion',
   'Ha sido un gusto conversar contigo. Recuerda que estamos aquí para escucharte. Cualquier consulta o sugerencia, no dudes en escribirnos. Un fuerte abrazo y que Dios te bendiga. Vamos juntos por un Perú mejor!',
   7),

  ('eece49d5-a315-4764-83f9-681cabae5c51', 'propuestas',
   'Respuesta sobre propuestas',
   'Cuando preguntan sobre propuestas o plan de gobierno',
   'Me alegra que preguntes sobre nuestras propuestas. Estamos enfocados en tres ejes fundamentales: salud para todos, educación de calidad y generación de empleo. Si quieres conocer más detalles, con mucho gusto te los comparto. Lo importante es que cada propuesta nace de escuchar a la gente como tú.',
   8)

ON CONFLICT DO NOTHING;

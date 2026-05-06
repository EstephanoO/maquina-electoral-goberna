-- 035_appointments_memory.sql
-- 1. AGENDA: appointments + slots de disponibilidad por operador.
-- 2. CONVERSATION MEMORY: índice optimizado para últimos N mensajes por lead
--    (ya existe interactions, solo agregamos vista helper).

-- ─────────────────────────────────────────────────────────────────────
-- 1. Appointments
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id            SERIAL PRIMARY KEY,
  lead_id       INT REFERENCES leads(id) ON DELETE SET NULL,
  operator_id   INT REFERENCES users(id) ON DELETE SET NULL,
  bot_instance_id INT REFERENCES bot_instances(id) ON DELETE SET NULL,

  scheduled_at  TIMESTAMPTZ NOT NULL,
  duration_min  INT NOT NULL DEFAULT 30,
  meeting_url   TEXT,                   -- Zoom / Meet link
  meeting_kind  TEXT NOT NULL DEFAULT 'zoom',  -- zoom | meet | call

  status        TEXT NOT NULL DEFAULT 'confirmed',  -- pending | confirmed | completed | cancelled | no_show
  notes         TEXT,
  created_via   TEXT,                   -- bot | operator | api

  reminder_sent_at TIMESTAMPTZ,         -- 1h antes
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_scheduled
  ON appointments(scheduled_at) WHERE status IN ('pending','confirmed');
CREATE INDEX IF NOT EXISTS idx_appointments_lead
  ON appointments(lead_id);
CREATE INDEX IF NOT EXISTS idx_appointments_operator
  ON appointments(operator_id);


-- ─────────────────────────────────────────────────────────────────────
-- 2. Slots de disponibilidad — recurring weekly schedule por operador
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointment_slots (
  id            SERIAL PRIMARY KEY,
  operator_id   INT REFERENCES users(id) ON DELETE CASCADE,
  weekday       INT NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0=Sun..6=Sat
  start_hr      INT NOT NULL CHECK (start_hr BETWEEN 0 AND 23),
  start_min     INT NOT NULL DEFAULT 0,
  end_hr        INT NOT NULL CHECK (end_hr BETWEEN 0 AND 23),
  end_min       INT NOT NULL DEFAULT 0,
  duration_min  INT NOT NULL DEFAULT 30,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(operator_id, weekday, start_hr, start_min)
);

-- Default: lunes-viernes 10:00-18:00 (slots de 30min) para Kathy (user_id=4)
-- Si no existe Kathy, no inserta nada. user 4 = cathy@goberna.pe.
INSERT INTO appointment_slots (operator_id, weekday, start_hr, end_hr, duration_min)
SELECT 4, w, 10, 18, 30
  FROM generate_series(1, 5) AS w  -- lunes(1) a viernes(5)
 WHERE EXISTS (SELECT 1 FROM users WHERE id = 4)
ON CONFLICT (operator_id, weekday, start_hr, start_min) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────
-- 3. Vista helper: próximas N reuniones
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_upcoming_appointments AS
SELECT
  a.id, a.scheduled_at, a.duration_min, a.meeting_url, a.meeting_kind,
  a.status, a.notes,
  l.id AS lead_id, l.name AS lead_name, l.phone AS lead_phone,
  l.country, l.buyer_tier,
  u.email AS operator_email, u.name AS operator_name,
  EXTRACT(EPOCH FROM (a.scheduled_at - now()))::int AS seconds_until
FROM appointments a
LEFT JOIN leads l ON l.id = a.lead_id
LEFT JOIN users u ON u.id = a.operator_id
WHERE a.status IN ('pending', 'confirmed')
  AND a.scheduled_at > now()
ORDER BY a.scheduled_at ASC;


-- ─────────────────────────────────────────────────────────────────────
-- 4. Reglas IA para detectar intent de agenda
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO ai_rules (name, pattern, tag, weight, enabled, source) VALUES
  ('intent:agenda',
   '(?i)\b(agendar|cita|reuni[oó]n|llamada|programar|cuando\s*podemos\s*(hablar|conversar)|disponible.*hablar|me\s*llamas|llamame|cuando\s*me\s*llamas)\b',
   'intent:agenda', 1.0, TRUE, 'bot_agenda'),

  ('intent:agenda_confirm',
   '(?i)^(s[ií]|confirmo|ok|okay|dale|perfecto|me\s*va|me\s*sirve|esa\s*hora|listo)\b',
   'intent:agenda_confirm', 0.5, TRUE, 'bot_agenda')
ON CONFLICT DO NOTHING;


SELECT
  (SELECT count(*) FROM appointments) AS apts,
  (SELECT count(*) FROM appointment_slots) AS slots;

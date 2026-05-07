-- 042_escalation.sql
-- Escalation a operador humano cuando el lead pide algo sensible.
--
-- Por qué: el bot no debe responder con credenciales/contraseñas/datos
-- personales del lead — esa info la maneja siempre un humano. Cuando
-- detectamos un intent así, mandamos al lead un mensaje "un momento" y
-- avisamos por WhatsApp al `escalation_phone` de la instancia para que
-- el operador atienda.
--
-- Tabla `escalations` también sirve como audit log: queda traza de cada
-- vez que el bot escaló y a quién, con motivo y mensaje original.

-- 1. Columna escalation_phone por instancia
ALTER TABLE bot_instances
  ADD COLUMN IF NOT EXISTS escalation_phone TEXT;

-- Default genérico (operador admin de Goberna). Editable por instancia
-- desde /settings.
UPDATE bot_instances
SET escalation_phone = '+51955135507'
WHERE escalation_phone IS NULL;

-- 2. Audit log de escalations
CREATE TABLE IF NOT EXISTS escalations (
  id              SERIAL PRIMARY KEY,
  lead_id         INT REFERENCES leads(id) ON DELETE SET NULL,
  bot_instance_id INT REFERENCES bot_instances(id) ON DELETE SET NULL,

  -- Motivo: 'credentials' (pidió contraseña), 'sensitive_personal_data', etc.
  reason          TEXT NOT NULL,

  -- El mensaje original del lead que disparó la escalation
  inbound_body    TEXT NOT NULL,

  -- Número al que se notificó (snapshot del escalation_phone al momento)
  notified_phone  TEXT NOT NULL,

  -- Estado del envío de la notificación al operador
  notify_status   TEXT NOT NULL DEFAULT 'pending', -- pending|sent|failed|skipped
  notify_error    TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,                     -- cuando el operador respondió manualmente
  resolved_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_escalations_lead ON escalations(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_escalations_unresolved ON escalations(created_at DESC) WHERE resolved_at IS NULL;

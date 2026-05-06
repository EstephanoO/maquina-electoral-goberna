-- 033_campaigns.sql
-- Sistema de campañas masivas para re-engagement de antiguos compradores,
-- cross-sell, recontacto a VIPs inactivos, etc.
--
-- Modelo:
--   campaigns          → definición (segment + template + schedule)
--   campaign_recipients → 1 row por lead alcanzado (para tracking individual)
--
-- El bot procesa pending recipients respetando throttle por instancia
-- (default 10 mensajes/min) y horario de ventana (default 9am-7pm Perú).

CREATE TABLE IF NOT EXISTS campaigns (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,

  -- Segmento de leads (filtros como JSONB para flexibilidad).
  -- Ejemplos:
  --   { "buyer_tier": "vip", "last_purchase_year": { "lte": 2024 } }
  --   { "stage": "delivered", "days_since_contact": { "gte": 60 } }
  --   { "country": "Perú", "tags": { "contains": "interés:gestion-parlamentaria" } }
  segment_filter JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Template a usar. Puede ser un template_id o un body custom (uno u otro).
  template_id   INT REFERENCES templates(id) ON DELETE SET NULL,
  custom_body   TEXT,
  -- Override de imagen/doc/video si querés un asset específico para esta camp.
  custom_image_url    TEXT,
  custom_document_url TEXT,

  -- Bot instance que va a enviar. Si NULL, usa la instancia con auto_reply=TRUE
  -- (probablemente p4 Kathy).
  bot_instance_id INT REFERENCES bot_instances(id) ON DELETE SET NULL,

  -- Throttle + ventana horaria
  throttle_per_min INT NOT NULL DEFAULT 10,
  window_start_hr  INT NOT NULL DEFAULT 9,    -- 9am
  window_end_hr    INT NOT NULL DEFAULT 19,   -- 7pm
  timezone         TEXT NOT NULL DEFAULT 'America/Lima',

  -- Estado
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft | scheduled | running | paused | completed | cancelled
  scheduled_at    TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,

  -- Stats cacheadas (se recalculan)
  total_recipients   INT NOT NULL DEFAULT 0,
  sent_count         INT NOT NULL DEFAULT 0,
  failed_count       INT NOT NULL DEFAULT 0,
  replied_count      INT NOT NULL DEFAULT 0,
  opted_out_count    INT NOT NULL DEFAULT 0,
  converted_count    INT NOT NULL DEFAULT 0,  -- leads que compraron post-campaña

  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status) WHERE status IN ('scheduled','running','paused');

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id            SERIAL PRIMARY KEY,
  campaign_id   INT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id       INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed | opted_out | replied | converted | skipped
  error_msg     TEXT,
  sent_at       TIMESTAMPTZ,
  message_id    TEXT,                  -- WA message id si se logró enviar
  reply_at      TIMESTAMPTZ,
  converted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_pending
  ON campaign_recipients(campaign_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_lead
  ON campaign_recipients(lead_id);

-- ─────────────────────────────────────────────────────────────────────
-- Predefined segment templates (para que el operador no tenga que escribir
-- JSONB filters a mano — la UI los carga del DB)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS segment_presets (
  id          SERIAL PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  filter      JSONB NOT NULL,
  icon        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO segment_presets (slug, name, description, filter, icon) VALUES
  ('vip_inactive_60d',
   '👑 VIPs sin contacto 60+ días',
   'Clientes top que merecen recontacto personalizado',
   '{"buyer_tier":"vip","days_since_contact":{"gte":60}}',
   'Crown'),
  ('repeat_buyers',
   '🔁 Compradores recurrentes',
   'Buyer tier repeat — listos para nuevo curso',
   '{"buyer_tier":"repeat"}',
   'Repeat'),
  ('delivered_30d',
   '📦 Egresados últimos 30 días',
   'Cross-sell de cursos complementarios',
   '{"stage":"delivered","days_since_purchase":{"lte":30}}',
   'Award'),
  ('reengagement_old',
   '😴 Re-engagement antiguos',
   'Compraron hace 1+ año, ofrecer novedad',
   '{"buyer_tier":{"in":["repeat","single"]},"last_purchase_year":{"lte":2024}}',
   'Clock'),
  ('interested_no_buy',
   '💡 Interesados sin comprar',
   'Lead stage interested pero no compró nunca',
   '{"stage":"interested","n_purchases":0}',
   'Lightbulb'),
  ('country_peru',
   '🇵🇪 Solo Perú',
   'Filtro geográfico simple',
   '{"country":"Perú"}',
   'MapPin'),
  ('country_mexico',
   '🇲🇽 Solo México',
   'Filtro geográfico simple',
   '{"country":"México"}',
   'MapPin'),
  ('all_with_phone',
   '📱 Todos con teléfono',
   'Universo completo con phone válido',
   '{"has_phone":true}',
   'Phone')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  filter = EXCLUDED.filter, icon = EXCLUDED.icon;

-- ─────────────────────────────────────────────────────────────────────
-- Helper view: campaign progress
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_campaign_progress AS
SELECT
  c.id,
  c.name,
  c.status,
  c.total_recipients,
  c.sent_count,
  c.failed_count,
  c.replied_count,
  c.converted_count,
  CASE WHEN c.total_recipients > 0
    THEN ROUND(100.0 * c.sent_count / c.total_recipients, 1)
    ELSE 0 END AS pct_sent,
  CASE WHEN c.sent_count > 0
    THEN ROUND(100.0 * c.replied_count / c.sent_count, 1)
    ELSE 0 END AS reply_rate_pct,
  CASE WHEN c.sent_count > 0
    THEN ROUND(100.0 * c.converted_count / c.sent_count, 1)
    ELSE 0 END AS conversion_rate_pct,
  c.scheduled_at, c.started_at, c.completed_at,
  c.created_at
FROM campaigns c
ORDER BY c.created_at DESC;

SELECT count(*) AS presets FROM segment_presets;

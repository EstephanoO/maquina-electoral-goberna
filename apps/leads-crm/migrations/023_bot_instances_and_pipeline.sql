-- 023_bot_instances_and_pipeline.sql
-- Dos cosas:
--   1. bot_instances: configuración por celular (p1, p2, p3, p4 …) — nombre del
--      agente, productos featured, cuenta bancaria, prompt, etc. — copiable.
--   2. pipeline_stages: embudo de ventas configurable por la UI.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Pipeline configurable
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id            SERIAL PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE,        -- contacted, interested, sold, …
  label         TEXT NOT NULL,               -- "📞 Contactado"
  color         TEXT NOT NULL DEFAULT 'bg-slate-100 text-slate-800',
  position      INT  NOT NULL DEFAULT 0,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  group_name    TEXT NOT NULL DEFAULT 'sale', -- sale | post | out
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO pipeline_stages (key, label, color, position, group_name) VALUES
  ('contacted',  '📞 Contactado',  'bg-blue-100 text-blue-800',       1, 'sale'),
  ('interested', '💡 Interesado',  'bg-amber-100 text-amber-800',     2, 'sale'),
  ('sold',       '💰 Vendido',     'bg-green-100 text-green-800',     3, 'sale'),
  ('delivered',  '📦 Entregado',   'bg-teal-100 text-teal-800',       4, 'post'),
  ('follow_up',  '🔁 Seguimiento', 'bg-cyan-100 text-cyan-800',       5, 'post'),
  ('recontact',  '📲 Recontacto',  'bg-violet-100 text-violet-800',   6, 'post'),
  ('resold',     '🏆 Re-vendido',  'bg-emerald-100 text-emerald-800', 7, 'post'),
  ('lost',       '❌ Perdido',     'bg-red-100 text-red-800',         8, 'out')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, color = EXCLUDED.color, position = EXCLUDED.position,
  group_name = EXCLUDED.group_name, updated_at = now();


-- ─────────────────────────────────────────────────────────────────────
-- 2. Bot instances (p1, p2, p3, p4, …) — config por celular
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_instances (
  id              SERIAL PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,                  -- p1, p2, p3, p4
  display_name    TEXT NOT NULL,                         -- "Goberna Escuela", "Operadora Kathy"
  phone           TEXT,                                  -- +51944531711
  agent_name      TEXT NOT NULL DEFAULT 'Goberna',       -- "Kathy", "Mara", etc.
  agent_signature TEXT,                                  -- "Kathy Asesora de Goberna"

  -- Configuración de productos: lista de SKUs activos para esta instancia.
  -- Si NULL, usa todos los `featured = TRUE` globales.
  product_skus    TEXT[],

  -- Cuenta bancaria personalizada (texto multilinea)
  cuenta_bancaria TEXT,
  yape_numero     TEXT,

  -- Prompt extra específico de esta instancia (concatenado al global)
  extra_prompt    TEXT,

  -- IDs de ai_rules.id que aplican a este bot. NULL = todas.
  rule_ids        INT[],

  -- Estado runtime
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  auto_reply      BOOLEAN NOT NULL DEFAULT FALSE,        -- 🛑 OFF por default
  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_instances_enabled ON bot_instances(enabled) WHERE enabled = TRUE;

-- Seed las instancias conocidas (p1-p4 que el user mencionó).
INSERT INTO bot_instances (slug, display_name, phone, agent_name, agent_signature, auto_reply, notes) VALUES
  ('p4', 'Producción · número activo', '+51944531711', 'Kathy', 'Kathy Asesora de Goberna', FALSE, 'Número de pruebas y producción actual. NO ACTIVAR autoreply hasta confirmación.'),
  ('p3', 'Backup', NULL, 'Goberna', 'Goberna', FALSE, 'Backup. Cerrado por el user el 2026-05-06.'),
  ('p2', 'Backup', NULL, 'Goberna', 'Goberna', FALSE, 'Backup'),
  ('p1', 'Producción anterior', NULL, 'Goberna', 'Goberna', FALSE, 'Histórico')
ON CONFLICT (slug) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────
-- 3. Bank accounts catálogo (para reusar entre productos / instancias)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,                            -- "Goberna BCP Soles"
  body         TEXT NOT NULL,                            -- texto multilinea con los datos
  yape_numero  TEXT,
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO bank_accounts (name, body, yape_numero, is_default) VALUES
  ('Goberna Escuela — Soles',
   E'🏫 *ESCUELA ACADEMICA GOBERNA EIRL*\n*RUC:* 20608310925\n\n🏦 *BCP*\n*Cuenta:* 1939936368051\n*CCI:* 00219300993636805115\n\n🏦 *INTERBANK*\n*Cuenta:* 2003004813730\n*CCI:* 00320000300481373038',
   '944531711',
   TRUE)
ON CONFLICT DO NOTHING;


SELECT 'pipeline_stages' AS tabla, count(*) FROM pipeline_stages
UNION ALL SELECT 'bot_instances', count(*) FROM bot_instances
UNION ALL SELECT 'bank_accounts', count(*) FROM bank_accounts;

-- 043_blast_v2.sql
-- Blast v2: Orchestration engine, operator assignment, A/B templates, engagement tracking.
-- All DDL is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
--
-- Depends on:
--   blast_log, blast_number_config    (created at runtime by blast/repository.ts ensureBlastTables)
--   campaigns(id)                     (001_auth_tables.sql)
--   users(id)                         (001_auth_tables.sql)
--   conversations(id)                 (037_conversations.sql)
--   voter_profiles                    (038_voter_profiles.sql)
--
-- Related doc: docs/BLAST-V2-ARCHITECTURE.md

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Extend blast_number_config with orchestration state fields
--    These columns let the backend track the state machine per phone.
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE blast_number_config
  ADD COLUMN IF NOT EXISTS state            text NOT NULL DEFAULT 'dormant',
  ADD COLUMN IF NOT EXISTS daily_limit      int  NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS sent_today       int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replied_today    int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_today     int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS no_wa_today      int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spam_score       int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reply_rate_7d    real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quality_rating   text NOT NULL DEFAULT 'green',
  ADD COLUMN IF NOT EXISTS state_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS counters_reset_at date NOT NULL DEFAULT CURRENT_DATE;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Extend blast_log with template tracking and reply correlation
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE blast_log
  ADD COLUMN IF NOT EXISTS template_id       text,
  ADD COLUMN IF NOT EXISTS template_variant  text,
  ADD COLUMN IF NOT EXISTS reply_received    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reply_at          timestamptz,
  ADD COLUMN IF NOT EXISTS reply_latency_s   int;

CREATE INDEX IF NOT EXISTS idx_blast_log_reply
  ON blast_log(campaign_id, wa_number, reply_received)
  WHERE reply_received = true;

CREATE INDEX IF NOT EXISTS idx_blast_log_template
  ON blast_log(campaign_id, template_id, template_variant);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Operator assignments — conversation routing
--    Maps an incoming reply to a specific operator with lock timeout.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS blast_operator_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id),
  conversation_id uuid REFERENCES conversations(id),
  jid             text NOT NULL,
  wa_number       text NOT NULL,
  assigned_to     uuid REFERENCES users(id),
  status          text NOT NULL DEFAULT 'pending',
  assigned_at     timestamptz DEFAULT now(),
  locked_until    timestamptz DEFAULT now() + interval '15 minutes',
  resolved_at     timestamptz,
  reply_count     int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blast_op_assign_operator
  ON blast_operator_assignments(campaign_id, assigned_to, status);

CREATE INDEX IF NOT EXISTS idx_blast_op_assign_jid
  ON blast_operator_assignments(campaign_id, jid);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Operator status — heartbeat tracking
--    Each operator sends a heartbeat every 60s from the extension.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS blast_operator_status (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id),
  user_id         uuid NOT NULL REFERENCES users(id),
  wa_number       text,
  role            text NOT NULL DEFAULT 'responder',
  is_online       boolean NOT NULL DEFAULT false,
  last_heartbeat  timestamptz NOT NULL DEFAULT now(),
  active_conversations int NOT NULL DEFAULT 0,
  max_concurrent  int NOT NULL DEFAULT 8,
  avg_response_ms int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, user_id)
);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Template A/B testing
--    Stores template variants with weights and reply metrics.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS blast_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id),
  template_id     text NOT NULL,
  variant         text NOT NULL DEFAULT 'A',
  body            text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  weight          real NOT NULL DEFAULT 1.0,

  -- Metrics (updated by cron or trigger)
  sent_count      int NOT NULL DEFAULT 0,
  reply_count     int NOT NULL DEFAULT 0,
  reply_rate      real NOT NULL DEFAULT 0,

  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, template_id, variant)
);

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Engagement scoring on voter_profiles
--    Adds blast-specific tracking columns to the existing voter profile.
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE voter_profiles
  ADD COLUMN IF NOT EXISTS engagement_score    real DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_tier     text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS blast_contacted     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS blast_replied       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS blast_converted     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS blast_contact_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_blast_at       timestamptz;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Daily phone metrics — 7-day rolling analytics
--    One row per phone per day, aggregated for trend visualization.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS blast_daily_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id),
  wa_number       text NOT NULL,
  metric_date     date NOT NULL DEFAULT CURRENT_DATE,
  sent            int NOT NULL DEFAULT 0,
  delivered       int NOT NULL DEFAULT 0,
  replied         int NOT NULL DEFAULT 0,
  failed          int NOT NULL DEFAULT 0,
  no_wa           int NOT NULL DEFAULT 0,
  avg_reply_time_s int,
  spam_score_max  int NOT NULL DEFAULT 0,
  quality_rating  text NOT NULL DEFAULT 'green',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, wa_number, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_blast_daily_metrics_range
  ON blast_daily_metrics(campaign_id, wa_number, metric_date DESC);

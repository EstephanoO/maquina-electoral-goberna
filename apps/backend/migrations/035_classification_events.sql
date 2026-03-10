-- 035: Classification events — tracks auto and manual classifications from WA extension
-- Used for: real-time feed, correction UI, accuracy metrics

CREATE TABLE IF NOT EXISTS classification_events (
  id            BIGSERIAL    PRIMARY KEY,
  campaign_id   UUID         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  operator_id   UUID         NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  validation_id UUID         REFERENCES form_validations(id)   ON DELETE SET NULL,
  phone         TEXT,
  contact_name  TEXT,
  message_text  TEXT         NOT NULL DEFAULT '',

  -- Classification result
  source        TEXT         NOT NULL DEFAULT 'auto',  -- 'auto' | 'manual' | 'correction'
  category      TEXT         NOT NULL DEFAULT '',       -- pide_dinero, sector_salud, coordinador, etc.
  vote_class    TEXT         NOT NULL DEFAULT '',       -- duro, blando, flotante, ''
  status        TEXT         NOT NULL DEFAULT '',       -- respondido, invalido, ''
  confidence    REAL         NOT NULL DEFAULT 0,        -- 0.0 – 1.0
  reason        TEXT         NOT NULL DEFAULT '',

  -- Correction fields (filled when source='correction')
  corrected_vote_class TEXT,     -- the corrected value (null if not corrected)
  corrected_status     TEXT,     -- the corrected status (null if not corrected)
  corrected_by         UUID     REFERENCES users(id) ON DELETE SET NULL,
  corrected_at         TIMESTAMPTZ,

  -- If this is a correction, link to the original event
  original_event_id    BIGINT  REFERENCES classification_events(id) ON DELETE SET NULL,

  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_classification_events_campaign
  ON classification_events(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_classification_events_phone
  ON classification_events(campaign_id, phone);

CREATE INDEX IF NOT EXISTS idx_classification_events_validation
  ON classification_events(validation_id);

CREATE INDEX IF NOT EXISTS idx_classification_events_source
  ON classification_events(campaign_id, source);

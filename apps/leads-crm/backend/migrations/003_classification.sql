ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS interests          TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS priority           TEXT        NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('high','medium','low')),
  ADD COLUMN IF NOT EXISTS next_follow_up_at  TIMESTAMPTZ;

-- Migrate legacy course → interests
UPDATE leads
SET interests = ARRAY[course]
WHERE course IS NOT NULL AND (interests IS NULL OR array_length(interests, 1) IS NULL);

CREATE INDEX IF NOT EXISTS idx_leads_priority_stage ON leads (priority, stage);
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up ON leads (next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_interests ON leads USING gin (interests);

-- 008: Add meet_id column to forms table
-- Allows tracking which forms were submitted during a specific meet

ALTER TABLE forms ADD COLUMN IF NOT EXISTS meet_id UUID REFERENCES meets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_forms_meet_id ON forms (meet_id) WHERE meet_id IS NOT NULL;

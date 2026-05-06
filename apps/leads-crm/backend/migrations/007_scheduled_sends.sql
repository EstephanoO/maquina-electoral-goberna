-- Allow scheduling sends in the future. NULL = send asap.
ALTER TABLE sends
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS sends_scheduled_at_idx
  ON sends (scheduled_at)
  WHERE status = 'pending';

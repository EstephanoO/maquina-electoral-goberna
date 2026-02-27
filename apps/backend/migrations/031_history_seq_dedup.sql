-- Add seq column to agent_location_history for deduplication (audit issue 8.4).
-- If the write-behind consumer retries a batch, duplicate history rows are prevented.

ALTER TABLE agent_location_history ADD COLUMN IF NOT EXISTS seq BIGINT;

-- Unique index on (agent_id, seq) prevents duplicate history entries.
-- CONCURRENTLY to avoid locking the table during creation.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_history_agent_seq
  ON agent_location_history (agent_id, seq);

-- 036: Add event_type to cms_extension_events
-- Fixes wa_sent metric inflation: previously counted both sent AND received messages.
-- Now wa_sent queries filter by event_type = 'message_sent'.
-- Default is 'message_sent' so all existing rows (overwhelmingly sends) stay correct.

ALTER TABLE cms_extension_events
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(20) NOT NULL DEFAULT 'message_sent';

CREATE INDEX IF NOT EXISTS idx_ext_events_type
  ON cms_extension_events(campaign_id, event_type);

-- 049: Drop Twilio surface (decision: la única fuente de WA es Baileys QR via bot thin pipe)
--
-- Removes:
--   1. cms_twilio_messages table (was 32 rows, all Feb-2026 test data)
--   2. campaigns.config.twilio JSONB key (encrypted credentials per campaign)
--
-- Cascading: cms_twilio_messages had no inbound FKs from other tables, safe to drop.

DROP TABLE IF EXISTS cms_twilio_messages CASCADE;

UPDATE campaigns
   SET config = config - 'twilio',
       updated_at = now()
 WHERE config ? 'twilio';

/**
 * set-vasquez-wa-channel.ts
 *
 * One-off: adds whatsapp_channel_url to César Vásquez's campaign config.
 * Merges into existing config JSONB without overwriting other fields.
 *
 * Usage:
 *   cd /srv/app && bun run apps/backend/scripts/set-vasquez-wa-channel.ts
 */
import "dotenv/config";
import { Pool } from "pg";
import { getEnv } from "../src/config/env";

const CAMPAIGN_ID = "eece49d5-a315-4764-83f9-681cabae5c51"; // César Vásquez
const WA_CHANNEL_URL = "https://whatsapp.com/channel/0029Vb7vDOX11ulIjc8tQw3s";

async function main() {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.databaseUrl });

  try {
    // Merge whatsapp_channel_url into existing config JSONB
    const { rowCount } = await pool.query(
      `UPDATE campaigns
       SET config = config || $1::jsonb,
           updated_at = now()
       WHERE id = $2`,
      [JSON.stringify({ whatsapp_channel_url: WA_CHANNEL_URL }), CAMPAIGN_ID],
    );

    if (rowCount === 0) {
      console.error(`Campaign ${CAMPAIGN_ID} not found`);
      process.exit(1);
    }

    console.log(`Updated César Vásquez campaign with whatsapp_channel_url: ${WA_CHANNEL_URL}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

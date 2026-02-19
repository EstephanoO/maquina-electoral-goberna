/**
 * GOBERNA — Seed VCF contacts into form_submissions
 *
 * Usage:
 *   bun run scripts/seed-vcf-contacts.ts <vcf-file-path> <campaign-id>
 *
 * Example:
 *   bun run scripts/seed-vcf-contacts.ts apps/web/public/Contactos\(1\).vcf eece49d5-a315-4764-83f9-681cabae5c51
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Parse VCF ───────────────────────────────────────────────────────

type VcfContact = {
  name: string;
  phone: string;
};

function decodeQuotedPrintable(encoded: string): string {
  // Join continuation lines (=\n)
  const joined = encoded.replace(/=\r?\n/g, "");
  // Decode hex sequences
  const decoded = joined.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  // Handle UTF-8 multi-byte sequences
  try {
    const bytes = new Uint8Array(
      [...decoded].map((c) => c.charCodeAt(0)),
    );
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return decoded;
  }
}

function parseVcf(content: string): VcfContact[] {
  const contacts: VcfContact[] = [];
  const cards = content.split("BEGIN:VCARD");

  for (const card of cards) {
    if (!card.includes("END:VCARD")) continue;

    let name = "";
    let phone = "";

    const lines = card.split(/\r?\n/);
    for (const line of lines) {
      // FN (Full Name) - handles QUOTED-PRINTABLE encoding
      if (line.startsWith("FN;") && line.includes("QUOTED-PRINTABLE")) {
        const match = line.match(/QUOTED-PRINTABLE:(.+)/);
        if (match) name = decodeQuotedPrintable(match[1]).trim();
      } else if (line.startsWith("FN:")) {
        name = line.substring(3).trim();
      }

      // TEL
      if (line.startsWith("TEL;")) {
        const match = line.match(/:([\+\d]+)/);
        if (match) phone = match[1].trim();
      }
    }

    // Clean up name - remove leading dots/spaces
    name = name.replace(/^\.+/, "").trim();

    // Only add contacts with both name and phone
    if (name && phone) {
      // Normalize phone: ensure +51 prefix for Peru numbers without +
      if (!phone.startsWith("+") && phone.length === 9) {
        phone = `+51${phone}`;
      }
      contacts.push({ name, phone });
    }
  }

  return contacts;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: bun run scripts/seed-vcf-contacts.ts <vcf-file> <campaign-id>");
    process.exit(1);
  }

  const vcfPath = resolve(args[0]);
  const campaignId = args[1];

  console.log(`Reading VCF: ${vcfPath}`);
  const content = readFileSync(vcfPath, "utf-8");
  const contacts = parseVcf(content);
  console.log(`Parsed ${contacts.length} contacts`);

  // Build the SQL payload
  const submissions = contacts.map((c, i) => ({
    form_definition_id: null,
    campaign_id: campaignId,
    meet_id: null,
    meet_group_id: null,
    submitted_by: null,
    data: JSON.stringify({
      nombre: c.name,
      telefono: c.phone.replace("+51", ""),
      candidato_preferido: "Cesar Vasquez",
      encuestador: "VCF Import",
      zona: "",
      comentarios: "",
      home_maps_url: null,
      polling_place_url: null,
    }),
    lat: null,
    lng: null,
    client_id: `vcf-import-${campaignId.substring(0, 8)}-${i}-${c.phone.replace(/\+/g, "")}`,
  }));

  const payload = JSON.stringify(submissions);

  // Connect to DB
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set. Set it or run from the backend dir with .env loaded.");
    process.exit(1);
  }

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const result = await client.query(
      `
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS x(
          form_definition_id uuid,
          campaign_id uuid,
          meet_id uuid,
          meet_group_id uuid,
          submitted_by uuid,
          data text,
          lat double precision,
          lng double precision,
          client_id text
        )
      ),
      inserted AS (
        INSERT INTO form_submissions (
          form_definition_id, campaign_id, meet_id, meet_group_id, submitted_by,
          data, lat, lng, client_id, synced_at
        )
        SELECT
          i.form_definition_id, i.campaign_id, i.meet_id, i.meet_group_id, i.submitted_by,
          i.data::jsonb, i.lat, i.lng, i.client_id, now()
        FROM incoming i
        ON CONFLICT (client_id) DO NOTHING
        RETURNING client_id
      )
      SELECT
        (SELECT count(*) FROM incoming) AS attempted,
        (SELECT count(*) FROM inserted) AS accepted
      `,
      [payload],
    );

    const row = result.rows[0];
    console.log(`Done! Attempted: ${row.attempted}, Accepted: ${row.accepted}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

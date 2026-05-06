/**
 * Import Google Contacts CSV into leads database.
 * Deduplicates by phone number.
 *
 * Usage: npx tsx src/import-contacts.ts /path/to/contacts.csv
 */
import { readFileSync } from "node:fs";
import { sql } from "./sql.js";

const CSV_PATH = process.argv[2];
if (!CSV_PATH) {
  console.error("Usage: npx tsx src/import-contacts.ts /path/to/contacts.csv");
  process.exit(1);
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function cleanPhone(raw: string): string | null {
  if (!raw) return null;
  // Remove weird characters like ´ and spaces
  let p = raw.replace(/[´`']/g, "").replace(/[^\d+]/g, "");
  // Ensure starts with +
  if (!p.startsWith("+") && p.length >= 10) p = "+" + p;
  // Must have at least 8 digits
  const digits = p.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return p;
}

function cleanName(first: string, middle: string, last: string): string {
  const parts = [first, middle, last].filter(Boolean).map(s => s.trim());
  let name = parts.join(" ");
  // Remove decorative characters
  name = name.replace(/[*\[\]{}!.]/g, "").trim();
  if (!name || name.length < 2) return "";
  return name;
}

async function run() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const lines = raw.split("\n").filter(l => l.trim());
  const header = parseCSVLine(lines[0]);

  // Find column indices
  const idx = {
    firstName: header.indexOf("First Name"),
    middleName: header.indexOf("Middle Name"),
    lastName: header.indexOf("Last Name"),
    email: header.indexOf("E-mail 1 - Value"),
    phone1: header.indexOf("Phone 1 - Value"),
    phone2: header.indexOf("Phone 2 - Value"),
    org: header.indexOf("Organization Name"),
  };

  console.log(`[import] CSV has ${lines.length - 1} rows`);
  console.log(`[import] Columns: firstName=${idx.firstName}, lastName=${idx.lastName}, email=${idx.email}, phone1=${idx.phone1}`);

  let imported = 0, skipped = 0, noPhone = 0, errors = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const phone1 = cleanPhone(fields[idx.phone1] || "");
    const phone2 = cleanPhone(fields[idx.phone2] || "");
    const phone = phone1 || phone2;

    if (!phone) { noPhone++; continue; }

    const name = cleanName(
      fields[idx.firstName] || "",
      fields[idx.middleName] || "",
      fields[idx.lastName] || "",
    );
    const email = (fields[idx.email] || "").trim() || null;

    // Deduplicate by phone digits
    const digits = phone.replace(/\D/g, "");
    const existing = await sql`
      SELECT id FROM leads
      WHERE regexp_replace(phone, '\\D', '', 'g') = ${digits}
      LIMIT 1
    `;

    if (existing.length > 0) {
      // Update name/email if lead has no name or "Sin nombre"
      const lead = existing[0];
      if (name) {
        await sql`
          UPDATE leads SET
            name = CASE WHEN name IS NULL OR name = 'Sin nombre' OR name = '' OR name ~ '^\\+?\\d+$' THEN ${name} ELSE name END,
            email = CASE WHEN email IS NULL THEN ${email} ELSE email END,
            updated_at = now()
          WHERE id = ${lead.id}
        `;
      }
      skipped++;
      continue;
    }

    // Create new lead
    try {
      await sql`
        INSERT INTO leads (name, phone, email, source, stage, tags, interests)
        VALUES (${name || "Sin nombre"}, ${phone}, ${email}, 'google_contacts', 'new', ${[]}, ${[]})
      `;
      imported++;
    } catch (e: any) {
      errors++;
      if (errors <= 5) console.error(`[import] Error row ${i}: ${e.message}`);
    }

    if (i % 500 === 0) console.log(`[import] Progress: ${i}/${lines.length - 1} (imported=${imported}, skipped=${skipped})`);
  }

  console.log(`\n[import] Done!`);
  console.log(`  Imported: ${imported}`);
  console.log(`  Skipped (already exists): ${skipped}`);
  console.log(`  No phone: ${noPhone}`);
  console.log(`  Errors: ${errors}`);

  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

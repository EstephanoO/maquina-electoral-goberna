/**
 * import_priority_zones.ts
 *
 * Imports GeoJSON files into campaign_priority_zones (refs) or campaign_custom_zones (geometry).
 *
 * Usage:
 *   bun run scripts/import_priority_zones.ts --campaign=<slug> --level=<level> --file=<path> [--replace] [--dry-run] [--validate]
 *
 * Levels:
 *   departamento, provincia, distrito  → campaign_priority_zones (reference only, no geometry stored)
 *   sector, subsector                  → campaign_custom_zones (geometry stored)
 *
 * Examples:
 *   bun run scripts/import_priority_zones.ts --campaign=rocio --level=departamento --file=public/geo/abuelo_rocio.geojson --replace
 *   bun run scripts/import_priority_zones.ts --campaign=giovanna-castagnino --level=sector --file=public/geo/nieto_giovanna.geojson --replace
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SQL } from "bun";

/* ============================================================
 * Types
 * ============================================================ */

type GeoJsonProperties = Record<string, unknown>;

type GeoJsonFeature = {
  type: "Feature";
  properties: GeoJsonProperties;
  geometry: unknown;
};

type GeoJson = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

type ZoneLevel = "departamento" | "provincia" | "distrito" | "sector" | "subsector";

const REF_LEVELS: ZoneLevel[] = ["departamento", "provincia", "distrito"];
const GEOM_LEVELS: ZoneLevel[] = ["sector", "subsector"];
const ALL_LEVELS: ZoneLevel[] = [...REF_LEVELS, ...GEOM_LEVELS];

/* ============================================================
 * CLI arg parsing
 * ============================================================ */

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: Record<string, string | boolean> = {};

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx > 0) {
        opts[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        opts[arg.slice(2)] = true;
      }
    }
  }

  const campaign = opts.campaign as string | undefined;
  const level = opts.level as ZoneLevel | undefined;
  const file = opts.file as string | undefined;
  const replace = !!opts.replace;
  const dryRun = !!opts["dry-run"];
  const validate = !!opts.validate;

  if (!campaign || !level || !file) {
    console.error("Usage: bun run scripts/import_priority_zones.ts --campaign=<slug> --level=<level> --file=<path> [--replace] [--dry-run] [--validate]");
    console.error("");
    console.error("Levels: departamento, provincia, distrito, sector, subsector");
    process.exit(1);
  }

  if (!ALL_LEVELS.includes(level)) {
    console.error(`Invalid level: ${level}. Must be one of: ${ALL_LEVELS.join(", ")}`);
    process.exit(1);
  }

  return { campaign, level, file, replace, dryRun, validate };
}

/* ============================================================
 * DB connection
 * ============================================================ */

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  // Try apps/backend/.env first, then legacy backend/.env.local
  const paths = [
    join(process.cwd(), "apps", "backend", ".env"),
    join(process.cwd(), "apps", "backend", ".env.local"),
    join(process.cwd(), "backend", ".env.local"),
  ];

  for (const envPath of paths) {
    try {
      const content = readFileSync(envPath, "utf8");
      const line = content.split("\n").map((l) => l.trim()).find((l) => l.startsWith("DATABASE_URL="));
      if (line) return line.slice("DATABASE_URL=".length);
    } catch { /* file not found, try next */ }
  }

  throw new Error("DATABASE_URL not found in env or .env files");
}

/* ============================================================
 * Zone code extraction per level
 * ============================================================ */

function extractZoneCode(props: GeoJsonProperties, level: ZoneLevel): string | null {
  switch (level) {
    case "departamento": {
      const coddep = String(props.CODDEP ?? props.coddep ?? "").trim();
      return coddep.length >= 2 ? coddep.slice(0, 2) : null;
    }
    case "provincia": {
      const coddep = String(props.CODDEP ?? props.coddep ?? "").trim();
      const codprov = String(props.CODPROV ?? props.codprov ?? "").trim();
      if (coddep.length >= 2 && codprov.length >= 2) return coddep.slice(0, 2) + codprov.slice(0, 2);
      return null;
    }
    case "distrito": {
      const ubigeo = String(props.UBIGEO ?? props.ubigeo ?? "").trim();
      return ubigeo.length >= 6 ? ubigeo.slice(0, 6) : null;
    }
    case "sector":
    case "subsector": {
      const ubigeo = String(props.UBIGEO ?? props.ubigeo ?? "").trim();
      return ubigeo.length >= 6 ? ubigeo.slice(0, 6) : null;
    }
  }
}

/* ============================================================
 * Main
 * ============================================================ */

async function main() {
  const { campaign, level, file, replace, dryRun, validate } = parseArgs();

  console.log(`\n=== Import Priority Zones ===`);
  console.log(`Campaign slug: ${campaign}`);
  console.log(`Level:         ${level}`);
  console.log(`File:          ${file}`);
  console.log(`Replace:       ${replace}`);
  console.log(`Dry run:       ${dryRun}`);
  console.log(`Validate:      ${validate}`);
  console.log("");

  // Read GeoJSON
  const filePath = file.startsWith("/") ? file : join(process.cwd(), file);
  const raw = readFileSync(filePath, "utf8");
  const geojson = JSON.parse(raw) as GeoJson;

  if (geojson.type !== "FeatureCollection") {
    throw new Error("File is not a GeoJSON FeatureCollection");
  }

  console.log(`Features in file: ${geojson.features.length}`);

  // Connect to DB
  const dbUrl = getDatabaseUrl();
  const db = new SQL(dbUrl);
  console.log(`Connected to database`);

  // Resolve campaign_id from slug
  const campaigns = await db`
    SELECT id, slug, name FROM campaigns WHERE slug = ${campaign} OR name ILIKE ${`%${campaign}%`} LIMIT 5
  `;

  if (campaigns.length === 0) {
    console.error(`No campaign found matching: ${campaign}`);
    console.error("Available campaigns:");
    const all = await db`SELECT slug, name FROM campaigns ORDER BY name`;
    for (const c of all) console.error(`  - ${c.slug} (${c.name})`);
    await db.close();
    process.exit(1);
  }

  if (campaigns.length > 1) {
    console.error(`Multiple campaigns match "${campaign}":`);
    for (const c of campaigns) console.error(`  - ${c.slug} (${c.name}) [${c.id}]`);
    console.error("Use a more specific slug.");
    await db.close();
    process.exit(1);
  }

  const campaignId = campaigns[0].id as string;
  const campaignName = campaigns[0].name as string;
  console.log(`Campaign: ${campaignName} [${campaignId}]`);

  // === REFERENCE LEVELS (departamento/provincia/distrito) ===
  if (REF_LEVELS.includes(level)) {
    const zoneCodes = new Set<string>();

    for (const feature of geojson.features) {
      const code = extractZoneCode(feature.properties, level);
      if (code) zoneCodes.add(code);
    }

    console.log(`Unique ${level} zone codes: ${zoneCodes.size}`);

    if (zoneCodes.size === 0) {
      console.error("No valid zone codes extracted. Check GeoJSON properties.");
      await db.close();
      process.exit(1);
    }

    // Print extracted codes
    for (const code of zoneCodes) {
      console.log(`  ${code}`);
    }

    // Validate against base map
    if (validate) {
      const table = level === "departamento" ? "peru_departamentos"
        : level === "provincia" ? "peru_provincias"
        : "peru_distritos";
      const codeCol = level === "departamento" ? "coddep"
        : level === "provincia" ? "(coddep || codprov)"
        : "ubigeo";

      console.log(`\nValidating against ${table}...`);
      for (const code of zoneCodes) {
        const result = await db.unsafe(`SELECT COUNT(*)::int AS c FROM ${table} WHERE ${codeCol} = $1`, [code]);
        if (result[0].c === 0) {
          console.warn(`  WARNING: ${code} not found in ${table}`);
        } else {
          console.log(`  OK: ${code}`);
        }
      }
    }

    if (dryRun) {
      console.log(`\n[DRY RUN] Would insert ${zoneCodes.size} rows into campaign_priority_zones`);
      await db.close();
      return;
    }

    // Replace if requested
    if (replace) {
      const deleted = await db`
        DELETE FROM campaign_priority_zones
        WHERE campaign_id = ${campaignId} AND zone_level = ${level}
        RETURNING id
      `;
      console.log(`Deleted ${deleted.length} existing ${level} zones for this campaign`);
    }

    // Insert
    let inserted = 0;
    for (const code of zoneCodes) {
      try {
        await db`
          INSERT INTO campaign_priority_zones (campaign_id, zone_level, zone_code)
          VALUES (${campaignId}, ${level}, ${code})
          ON CONFLICT (campaign_id, zone_level, zone_code) DO NOTHING
        `;
        inserted++;
      } catch (err) {
        console.error(`Failed to insert ${code}: ${err}`);
      }
    }

    console.log(`\nInserted ${inserted} rows into campaign_priority_zones`);
  }

  // === GEOMETRY LEVELS (sector/subsector) ===
  if (GEOM_LEVELS.includes(level)) {
    const features: Array<{
      zoneCode: string;
      sector: number | null;
      subsector: number | null;
      zoneName: string;
      parentCode: string;
      population: number | null;
      geometryJson: string;
    }> = [];

    for (const feature of geojson.features) {
      const zoneCode = extractZoneCode(feature.properties, level);
      if (!zoneCode) {
        console.warn(`Skipping feature with missing UBIGEO`);
        continue;
      }

      const props = feature.properties;
      const sectorVal = props.SECTOR != null ? Number(props.SECTOR) : null;
      const subsectorVal = props.SUBSECTOR != null ? Number(props.SUBSECTOR) : null;

      // For sector level: use SECTOR field; for subsector level: use both
      if (level === "sector" && sectorVal == null) {
        // Some features may not have SECTOR — use a sequential fallback
        console.warn(`Feature ${zoneCode} missing SECTOR, will use feature index`);
      }

      const distrito = String(props.DISTRITO ?? props.distrito ?? "").trim();
      const sector = sectorVal ?? null;
      const subsector = level === "subsector" ? (subsectorVal ?? null) : null;

      const zoneName = level === "subsector"
        ? `${distrito} - Sector ${sector ?? "?"} Sub ${subsector ?? "?"}`
        : `${distrito} - Sector ${sector ?? "?"}`;

      features.push({
        zoneCode,
        sector,
        subsector,
        zoneName,
        parentCode: zoneCode, // UBIGEO of the distrito
        population: props.POBLACION != null ? Number(props.POBLACION) : null,
        geometryJson: JSON.stringify(feature.geometry),
      });
    }

    console.log(`Valid features to import: ${features.length}`);

    if (features.length === 0) {
      console.error("No valid features extracted. Check GeoJSON structure.");
      await db.close();
      process.exit(1);
    }

    // Print summary
    const districts = new Set(features.map((f) => f.zoneCode));
    console.log(`Covering ${districts.size} distrito(s):`);
    for (const d of districts) {
      const count = features.filter((f) => f.zoneCode === d).length;
      console.log(`  ${d}: ${count} ${level}(s)`);
    }

    if (dryRun) {
      console.log(`\n[DRY RUN] Would insert ${features.length} rows into campaign_custom_zones`);
      await db.close();
      return;
    }

    // Replace if requested
    if (replace) {
      const deleted = await db`
        DELETE FROM campaign_custom_zones
        WHERE campaign_id = ${campaignId} AND zone_level = ${level}
        RETURNING id
      `;
      console.log(`Deleted ${deleted.length} existing ${level} zones for this campaign`);
    }

    // Insert
    let inserted = 0;
    for (const f of features) {
      try {
        await db`
          INSERT INTO campaign_custom_zones (
            campaign_id, zone_level, zone_code, zone_name, sector, subsector,
            parent_code, population, geom, source
          )
          VALUES (
            ${campaignId},
            ${level},
            ${f.zoneCode},
            ${f.zoneName},
            ${f.sector},
            ${f.subsector},
            ${f.parentCode},
            ${f.population},
            ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${f.geometryJson}), 4326), 3857)),
            'import'
          )
          ON CONFLICT (campaign_id, zone_level, zone_code, sector, subsector) DO UPDATE SET
            zone_name = EXCLUDED.zone_name,
            parent_code = EXCLUDED.parent_code,
            population = EXCLUDED.population,
            geom = EXCLUDED.geom,
            source = EXCLUDED.source
        `;
        inserted++;
      } catch (err) {
        console.error(`Failed to insert ${f.zoneName}: ${err}`);
      }
    }

    console.log(`\nInserted ${inserted} rows into campaign_custom_zones`);

    // Analyze for query planner
    await db`ANALYZE campaign_custom_zones`;
    console.log("Ran ANALYZE on campaign_custom_zones");
  }

  // Final counts
  const refCount = await db`SELECT COUNT(*)::int AS c FROM campaign_priority_zones WHERE campaign_id = ${campaignId}`;
  const customCount = await db`SELECT COUNT(*)::int AS c FROM campaign_custom_zones WHERE campaign_id = ${campaignId}`;
  console.log(`\nTotal zones for ${campaignName}:`);
  console.log(`  Priority refs:   ${refCount[0].c}`);
  console.log(`  Custom geometry: ${customCount[0].c}`);

  await db.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

/**
 * Re-import peru_provincias from provincias.geojson
 *
 * Usage:
 *   DATABASE_URL=postgresql://user:pass@host:5432/db bun scripts/import_provincias_geojson.ts
 *
 * The GeoJSON is CRS:84 (= EPSG:4326 WGS84).
 * We store geom as 4326 (source of truth) and geom_3857 as pre-projected for Tegola.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const { Client } = pg;

/* ─── Types ─── */

type ProvinciaFeature = {
  type: "Feature";
  properties: {
    OBJECTID?: number;
    CODDEP?: string;
    DEPARTAMEN?: string;
    CODPROV?: string;
    PROVINCIA?: string;
    CAPITAL?: string;
    FUENTE?: string;
  };
  geometry: unknown;
};

type GeoJson = {
  type: "FeatureCollection";
  features: ProvinciaFeature[];
};

/* ─── DB connection ─── */

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  // Try apps/backend/.env
  const paths = [
    join(process.cwd(), "apps", "backend", ".env"),
    join(process.cwd(), "backend", ".env.local"),
  ];

  for (const envPath of paths) {
    try {
      const content = readFileSync(envPath, "utf8");
      const line = content
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("DATABASE_URL="));
      if (line) return line.slice("DATABASE_URL=".length);
    } catch {
      // try next path
    }
  }

  throw new Error("DATABASE_URL not found in env or .env files");
}

/* ─── Main ─── */

const dbUrl = getDatabaseUrl();
const client = new Client({ connectionString: dbUrl });
await client.connect();

console.log("Connected to database");

// Load GeoJSON
const geoJsonPath = join(process.cwd(), "provincias.geojson");
const raw = readFileSync(geoJsonPath, "utf8");
const data = JSON.parse(raw) as GeoJson;

if (data.type !== "FeatureCollection") {
  throw new Error("File is not a FeatureCollection");
}

console.log(`Loaded ${data.features.length} features from provincias.geojson`);

// Ensure PostGIS
await client.query("CREATE EXTENSION IF NOT EXISTS postgis;");

// Delete existing data
const before = await client.query("SELECT COUNT(*)::int AS total FROM public.peru_provincias;");
console.log(`Existing rows in peru_provincias: ${before.rows[0].total}`);

await client.query("DELETE FROM public.peru_provincias;");
console.log("Deleted all existing rows");

// Insert features — gid is plain bigint (no serial), so we generate it
let inserted = 0;
for (const feature of data.features) {
  const gid = inserted + 1;
  const geometryJson = JSON.stringify(feature.geometry);
  const coddep = feature.properties.CODDEP ?? "";
  const codprov = feature.properties.CODPROV ?? "";
  const nomprov = feature.properties.PROVINCIA ?? "";

  await client.query(
    `INSERT INTO public.peru_provincias (gid, coddep, codprov, nomprov, geom, geom_3857)
     VALUES ($1, $2, $3, $4,
       ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)),
       ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326), 3857))
     )`,
    [gid, coddep, codprov, nomprov, geometryJson],
  );

  inserted++;
  if (inserted % 20 === 0) {
    console.log(`  inserted ${inserted}/${data.features.length}...`);
  }
}

// Rebuild indexes
console.log("Rebuilding indexes...");
await client.query("REINDEX TABLE public.peru_provincias;");

// Update stats
await client.query("ANALYZE public.peru_provincias;");

// Verify
const after = await client.query(
  `SELECT COUNT(*)::int AS total,
          COUNT(DISTINCT coddep) AS departamentos,
          MIN(ST_SRID(geom)) AS min_srid_4326,
          MAX(ST_SRID(geom)) AS max_srid_4326,
          MIN(ST_SRID(geom_3857)) AS min_srid_3857,
          MAX(ST_SRID(geom_3857)) AS max_srid_3857
   FROM public.peru_provincias;`,
);

const r = after.rows[0];
console.log(`\nImport complete:`);
console.log(`  Provincias: ${r.total}`);
console.log(`  Departamentos: ${r.departamentos}`);
console.log(`  geom SRID: ${r.min_srid_4326}-${r.max_srid_4326} (should be 4326)`);
console.log(`  geom_3857 SRID: ${r.min_srid_3857}-${r.max_srid_3857} (should be 3857)`);

await client.end();

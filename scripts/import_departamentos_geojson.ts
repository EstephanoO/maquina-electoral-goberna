import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SQL } from "bun";

type GeoJsonFeature = {
  type: "Feature";
  properties: {
    OBJECTID?: number;
    CODDEP?: string;
    DEPARTAMEN?: string;
    CAPITAL?: string;
    FUENTE?: string;
  };
  geometry: unknown;
};

type GeoJson = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

function getDatabaseUrlFromEnvFile(): string {
  const envPath = join(process.cwd(), "backend", ".env.local");
  const content = readFileSync(envPath, "utf8");
  const line = content
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.startsWith("DATABASE_URL="));

  if (!line) {
    throw new Error("No se encontro DATABASE_URL en backend/.env.local");
  }

  return line.slice("DATABASE_URL=".length);
}

const dbUrl = process.env.DATABASE_URL ?? getDatabaseUrlFromEnvFile();
const db = new SQL(dbUrl);

const geoJsonPath = join(process.cwd(), "geojsons", "departamentos 2.geojson");
const raw = readFileSync(geoJsonPath, "utf8");
const data = JSON.parse(raw) as GeoJson;

if (data.type !== "FeatureCollection") {
  throw new Error("El archivo no es un FeatureCollection");
}

await db`CREATE EXTENSION IF NOT EXISTS postgis;`;

await db`
  CREATE TABLE IF NOT EXISTS public.departamentos (
    id BIGSERIAL PRIMARY KEY,
    objectid INTEGER,
    coddep TEXT,
    departamento TEXT,
    capital TEXT,
    fuente TEXT,
    geom geometry(MultiPolygon, 3857) NOT NULL
  );
`;

await db`TRUNCATE TABLE public.departamentos;`;

for (const feature of data.features) {
  const geometryJson = JSON.stringify(feature.geometry);
  const objectId = feature.properties.OBJECTID ?? null;
  const coddep = feature.properties.CODDEP ?? null;
  const departamento = feature.properties.DEPARTAMEN ?? null;
  const capital = feature.properties.CAPITAL ?? null;
  const fuente = feature.properties.FUENTE ?? null;

  await db`
    INSERT INTO public.departamentos (objectid, coddep, departamento, capital, fuente, geom)
    VALUES (
      ${objectId},
      ${coddep},
      ${departamento},
      ${capital},
      ${fuente},
      ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${geometryJson}), 4326), 3857))
    );
  `;
}

await db`CREATE INDEX IF NOT EXISTS departamentos_geom_gix ON public.departamentos USING GIST (geom);`;
await db`ANALYZE public.departamentos;`;

const count = await db`SELECT COUNT(*)::int AS total FROM public.departamentos;`;
console.log(`Importacion completada. Filas cargadas: ${count[0].total}`);

await db.close();

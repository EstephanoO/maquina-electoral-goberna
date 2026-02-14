import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SQL } from "bun";

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

const geoJsonPath = join(process.cwd(), "geojsons", "provincias.geojson");
const raw = readFileSync(geoJsonPath, "utf8");
const data = JSON.parse(raw) as GeoJson;

if (data.type !== "FeatureCollection") {
  throw new Error("El archivo no es un FeatureCollection");
}

await db`CREATE EXTENSION IF NOT EXISTS postgis;`;

await db`
  CREATE TABLE IF NOT EXISTS public.provincias (
    id BIGSERIAL PRIMARY KEY,
    objectid INTEGER,
    coddep TEXT NOT NULL,
    departamento TEXT,
    codprov TEXT NOT NULL,
    codprov_full TEXT NOT NULL,
    provincia TEXT,
    capital TEXT,
    fuente TEXT,
    geom geometry(MultiPolygon, 3857) NOT NULL
  );
`;

await db`TRUNCATE TABLE public.provincias;`;

for (const feature of data.features) {
  const geometryJson = JSON.stringify(feature.geometry);
  const objectId = feature.properties.OBJECTID ?? null;
  const coddep = feature.properties.CODDEP ?? "";
  const departamento = feature.properties.DEPARTAMEN ?? null;
  const codprov = feature.properties.CODPROV ?? "";
  const codprovFull = `${coddep}${codprov}`;
  const provincia = feature.properties.PROVINCIA ?? null;
  const capital = feature.properties.CAPITAL ?? null;
  const fuente = feature.properties.FUENTE ?? null;

  await db`
    INSERT INTO public.provincias (
      objectid,
      coddep,
      departamento,
      codprov,
      codprov_full,
      provincia,
      capital,
      fuente,
      geom
    )
    VALUES (
      ${objectId},
      ${coddep},
      ${departamento},
      ${codprov},
      ${codprovFull},
      ${provincia},
      ${capital},
      ${fuente},
      ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${geometryJson}), 4326), 3857))
    );
  `;
}

await db`CREATE INDEX IF NOT EXISTS provincias_geom_gix ON public.provincias USING GIST (geom);`;
await db`CREATE INDEX IF NOT EXISTS provincias_coddep_idx ON public.provincias (coddep);`;
await db`CREATE INDEX IF NOT EXISTS provincias_codprov_full_idx ON public.provincias (codprov_full);`;
await db`ANALYZE public.provincias;`;

const count = await db`SELECT COUNT(*)::int AS total FROM public.provincias;`;
console.log(`Importacion completada. Provincias cargadas: ${count[0].total}`);

await db.close();

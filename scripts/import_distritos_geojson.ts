import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SQL } from "bun";

type DistritoFeature = {
  type: "Feature";
  properties: {
    OBJECTID_1?: number;
    UBIGEO?: string;
    CODDEP?: string;
    DEPARTAMEN?: string;
    CODPROV?: string;
    PROVINCIA?: string;
    CODDIST?: string;
    DISTRITO?: string;
    CAPITAL?: string;
    FUENTE?: string;
  };
  geometry: unknown;
};

type GeoJson = {
  type: "FeatureCollection";
  features: DistritoFeature[];
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

const geoJsonPath = join(process.cwd(), "geojsons", "distritos.geojson");
const raw = readFileSync(geoJsonPath, "utf8");
const data = JSON.parse(raw) as GeoJson;

if (data.type !== "FeatureCollection") {
  throw new Error("El archivo no es un FeatureCollection");
}

await db`CREATE EXTENSION IF NOT EXISTS postgis;`;

await db`
  CREATE TABLE IF NOT EXISTS public.distritos (
    id BIGSERIAL PRIMARY KEY,
    objectid_1 INTEGER,
    ubigeo TEXT NOT NULL,
    coddep TEXT NOT NULL,
    departamento TEXT,
    codprov TEXT NOT NULL,
    codprov_full TEXT NOT NULL,
    provincia TEXT,
    coddist TEXT NOT NULL,
    distrito TEXT,
    capital TEXT,
    fuente TEXT,
    geom geometry(MultiPolygon, 3857) NOT NULL
  );
`;

await db`TRUNCATE TABLE public.distritos;`;

for (const feature of data.features) {
  const geometryJson = JSON.stringify(feature.geometry);
  const objectId = feature.properties.OBJECTID_1 ?? null;
  const ubigeo = feature.properties.UBIGEO ?? "";
  const coddep = feature.properties.CODDEP ?? "";
  const departamento = feature.properties.DEPARTAMEN ?? null;
  const codprov = feature.properties.CODPROV ?? "";
  const codprovFull = `${coddep}${codprov}`;
  const provincia = feature.properties.PROVINCIA ?? null;
  const coddist = feature.properties.CODDIST ?? "";
  const distrito = feature.properties.DISTRITO ?? null;
  const capital = feature.properties.CAPITAL ?? null;
  const fuente = feature.properties.FUENTE ?? null;

  await db`
    INSERT INTO public.distritos (
      objectid_1,
      ubigeo,
      coddep,
      departamento,
      codprov,
      codprov_full,
      provincia,
      coddist,
      distrito,
      capital,
      fuente,
      geom
    )
    VALUES (
      ${objectId},
      ${ubigeo},
      ${coddep},
      ${departamento},
      ${codprov},
      ${codprovFull},
      ${provincia},
      ${coddist},
      ${distrito},
      ${capital},
      ${fuente},
      ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${geometryJson}), 4326), 3857))
    );
  `;
}

await db`CREATE INDEX IF NOT EXISTS distritos_geom_gix ON public.distritos USING GIST (geom);`;
await db`CREATE INDEX IF NOT EXISTS distritos_coddep_idx ON public.distritos (coddep);`;
await db`CREATE INDEX IF NOT EXISTS distritos_codprov_full_idx ON public.distritos (codprov_full);`;
await db`CREATE INDEX IF NOT EXISTS distritos_ubigeo_idx ON public.distritos (ubigeo);`;
await db`ANALYZE public.distritos;`;

const count = await db`SELECT COUNT(*)::int AS total FROM public.distritos;`;
console.log(`Importacion completada. Distritos cargados: ${count[0].total}`);

await db.close();

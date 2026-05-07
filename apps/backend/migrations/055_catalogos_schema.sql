-- 055: Catálogos de referencia para candidatos.* (modelo PII + postulación).
--
-- Contexto: el refactor 2026-05-05 con el geógrafo introdujo el schema
-- candidatos.* en prod, pero las tablas catalogos.* a las que apuntan sus
-- columnas (id_rol_campana, id_cargo_gobierno, id_organizacion_politica)
-- nunca llegaron a commitearse al repo y no existen en prod (los SQL en
-- /tmp ya se borraron). Esta migration las (re)construye desde cero.
--
-- geografia_politica.* (departamento/provincia/distrito con PostGIS) se
-- difiere a otro PR — viene del archivo del geógrafo (1891 distritos) y
-- excede el scope de este PR de onboarding endpoint. Las columnas geo en
-- candidatos.* quedan SIN FK por ahora.

CREATE SCHEMA IF NOT EXISTS catalogos;

-- ── País ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalogos.pais (
  id     SERIAL PRIMARY KEY,
  iso2   TEXT NOT NULL UNIQUE,
  iso3   TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL
);

-- ── Rol del titular en una campaña ─────────────────────────────────
-- DISTINTO de user_campaigns.role (admin/consultor/candidato/...).
-- Acá indica quién es el titular del provisioning: el propio candidato
-- o un estratega que arma la campaña en su nombre.
CREATE TABLE IF NOT EXISTS catalogos.rol_campana (
  id     SERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL
);

-- ── Nivel de gobierno (nacional/regional/local en PE) ──────────────
CREATE TABLE IF NOT EXISTS catalogos.nivel_gobierno (
  id      SERIAL PRIMARY KEY,
  id_pais INT  NOT NULL REFERENCES catalogos.pais(id) ON DELETE RESTRICT,
  codigo  TEXT NOT NULL,
  nombre  TEXT NOT NULL,
  UNIQUE (id_pais, codigo)
);

-- ── Cargo de gobierno ──────────────────────────────────────────────
-- ambito_geografico restringe qué columna geográfica aplica en
-- candidatos.postulacion (chk_jurisdiccion_unica ya existe en prod):
--   'pais'         → ninguna geo seteada
--   'departamento' → solo id_departamento
--   'provincia'    → solo id_provincia
--   'distrito'     → solo id_distrito
CREATE TABLE IF NOT EXISTS catalogos.cargo_gobierno (
  id                SERIAL PRIMARY KEY,
  id_nivel_gobierno INT  NOT NULL REFERENCES catalogos.nivel_gobierno(id) ON DELETE RESTRICT,
  codigo            TEXT NOT NULL,
  nombre            TEXT NOT NULL,
  ambito_geografico TEXT NOT NULL CHECK (ambito_geografico IN ('pais','departamento','provincia','distrito')),
  UNIQUE (id_nivel_gobierno, codigo)
);

-- ── Organización política (partido / movimiento) ──────────────────
CREATE TABLE IF NOT EXISTS catalogos.organizacion_politica (
  id      SERIAL PRIMARY KEY,
  id_pais INT  NOT NULL REFERENCES catalogos.pais(id) ON DELETE RESTRICT,
  codigo  TEXT NOT NULL,
  nombre  TEXT NOT NULL,
  siglas  TEXT,
  UNIQUE (id_pais, codigo)
);

CREATE INDEX IF NOT EXISTS idx_op_lower_nombre
  ON catalogos.organizacion_politica (lower(nombre));

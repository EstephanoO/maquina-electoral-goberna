-- 061_geografia_politica.sql
--
-- Schema geografia_politica.* — INEI/JNE political-administrative hierarchy
-- de Perú. Crea tablas vacías + FKs en candidatos.postulacion. El seed
-- (25 deps + ~196 provs + ~1879 distritos) se hace con un script aparte
-- (`bun scripts/seed-geografia-pe.ts`) leyendo el geojson INEI, no acá:
--   - mantiene este migration rápido y atómico
--   - el geojson cambia cuando INEI re-zonifica, el script es re-runnable
--
-- Migración 057 marcó los FKs hacia geografia_politica.* como deferred
-- ("queda fuera de este PR"). Este migration cierra ese gap.
--
-- IDs: usamos los códigos UBIGEO INEI directamente como INTEGER PKs:
--   - departamento.id = CODDEP (1-25)
--   - provincia.id    = CODDEP * 100 + CODPROV (e.g., Lima = 1501)
--   - distrito.id     = UBIGEO 6-digit (e.g., Cercado de Lima = 150101)
-- Esto le permite a nexus-control mapear sin lookup intermedio.

CREATE SCHEMA IF NOT EXISTS geografia_politica;

-- ── departamento ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geografia_politica.departamento (
  id      INT  PRIMARY KEY,                 -- CODDEP (1..25)
  id_pais INT  NOT NULL REFERENCES catalogos.pais(id) ON DELETE RESTRICT,
  codigo  TEXT NOT NULL,                    -- CODDEP zero-padded ('01'..'25')
  nombre  TEXT NOT NULL,
  UNIQUE (id_pais, codigo)
);

CREATE INDEX IF NOT EXISTS idx_dep_lower_nombre
  ON geografia_politica.departamento (lower(nombre));

-- ── provincia ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geografia_politica.provincia (
  id              INT  PRIMARY KEY,         -- CODDEP*100 + CODPROV
  id_departamento INT  NOT NULL REFERENCES geografia_politica.departamento(id) ON DELETE RESTRICT,
  codigo          TEXT NOT NULL,            -- CODDEP||CODPROV zero-padded ('0101', '1501')
  nombre          TEXT NOT NULL,
  UNIQUE (id_departamento, codigo)
);

CREATE INDEX IF NOT EXISTS idx_prov_dep
  ON geografia_politica.provincia (id_departamento);

CREATE INDEX IF NOT EXISTS idx_prov_lower_nombre
  ON geografia_politica.provincia (lower(nombre));

-- ── distrito ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geografia_politica.distrito (
  id           INT  PRIMARY KEY,            -- UBIGEO 6-digit como INT
  id_provincia INT  NOT NULL REFERENCES geografia_politica.provincia(id) ON DELETE RESTRICT,
  ubigeo       TEXT NOT NULL UNIQUE,        -- UBIGEO 6-digit string ('150101')
  nombre       TEXT NOT NULL,
  capital      TEXT,
  UNIQUE (id_provincia, ubigeo)
);

CREATE INDEX IF NOT EXISTS idx_dist_prov
  ON geografia_politica.distrito (id_provincia);

CREATE INDEX IF NOT EXISTS idx_dist_lower_nombre
  ON geografia_politica.distrito (lower(nombre));

-- ── FKs candidatos.postulacion → geografia_politica.* ─────────────
-- Idempotentes. Las columnas id_departamento/id_provincia/id_distrito
-- ya existían (con type INT) pero sin FK porque las tablas no existían.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postulacion_id_departamento_fkey') THEN
    ALTER TABLE candidatos.postulacion
      ADD CONSTRAINT postulacion_id_departamento_fkey
      FOREIGN KEY (id_departamento) REFERENCES geografia_politica.departamento(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postulacion_id_provincia_fkey') THEN
    ALTER TABLE candidatos.postulacion
      ADD CONSTRAINT postulacion_id_provincia_fkey
      FOREIGN KEY (id_provincia) REFERENCES geografia_politica.provincia(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postulacion_id_distrito_fkey') THEN
    ALTER TABLE candidatos.postulacion
      ADD CONSTRAINT postulacion_id_distrito_fkey
      FOREIGN KEY (id_distrito) REFERENCES geografia_politica.distrito(id) ON DELETE RESTRICT;
  END IF;
END $$;

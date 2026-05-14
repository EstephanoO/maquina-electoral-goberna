-- 001_candidatos_deck_datos_externos.sql
--
-- Schemas paralelos a lo que el geógrafo cura en `onboarding_fase1`.
-- NO toca fase_1.* ni geografia_politica.*.
--
-- candidatos.*       — pipeline del onboarding (lead → calificado → en_pitch → aprobado)
-- deck.*             — wizard fase-1 form + deck fase-2 publicado
-- datos_externos.*   — data enriquecedora (padrón ONPE, PIM MEF, resultados, INEI)
--
-- Convenciones:
-- - timestamps con timezone (TIMESTAMPTZ)
-- - FKs a peru_distritos/provincias/departamentos con ON DELETE RESTRICT
--   (el geógrafo no debería borrar, pero si lo hace, error claro)
-- - JSONB para forms y deck snapshots
-- - user_id de empleados Goberna como UUID sin FK (vive en appdb.public.users)

-- ── candidatos.* ────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS candidatos;

CREATE TYPE candidatos.estado_pipeline AS ENUM (
  'lead',
  'calificado',
  'en_pitch',
  'aprobado',
  'rechazado',
  'pausado'
);

CREATE TABLE IF NOT EXISTS candidatos.candidato (
  id                 BIGSERIAL PRIMARY KEY,
  slug               TEXT NOT NULL UNIQUE,         -- URL-safe, generado al crear
  nombres            TEXT NOT NULL,
  apellidos          TEXT NOT NULL,
  dni                TEXT,                          -- nullable hasta calificado
  telefono           TEXT,
  email              TEXT,
  foto_url           TEXT,
  fecha_nacimiento   DATE,
  lugar_nacimiento   TEXT,
  genero             TEXT,                          -- libre: 'masculino'/'femenino'/'otro'/null

  estado_pipeline    candidatos.estado_pipeline NOT NULL DEFAULT 'lead',

  -- Quién lo creó (empleado Goberna). UUID sin FK porque users vive en appdb.
  creado_por_user_id UUID,

  -- Promoción a cliente activo (futuro). Si exported_at IS NOT NULL → ya es cliente.
  exported_user_id   UUID,                          -- → appdb.public.users.id
  exported_at        TIMESTAMPTZ,

  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_dni_required_after_calificado
    CHECK (estado_pipeline = 'lead' OR dni IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_candidato_estado
  ON candidatos.candidato (estado_pipeline, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_candidato_creado_por
  ON candidatos.candidato (creado_por_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_candidato_dni
  ON candidatos.candidato (dni) WHERE dni IS NOT NULL;

COMMENT ON TABLE candidatos.candidato IS
  'Candidato político en proceso de onboarding (CRM interno Goberna). '
  'Sin auth propia hasta promoción a appdb como cliente activo.';

CREATE TABLE IF NOT EXISTS candidatos.postulacion (
  id                       BIGSERIAL PRIMARY KEY,
  id_candidato             BIGINT NOT NULL REFERENCES candidatos.candidato(id) ON DELETE CASCADE,

  id_cargo_gobierno        INTEGER REFERENCES fase_1.cargo_gobierno(id) ON DELETE RESTRICT,
  id_organizacion_politica INTEGER REFERENCES fase_1.organizacion_politica(id) ON DELETE RESTRICT,
  id_proceso_electoral     INTEGER REFERENCES fase_1.proceso_electoral(id) ON DELETE RESTRICT,

  -- Jurisdicción (al menos UNA según ámbito del cargo)
  id_departamento  INTEGER REFERENCES geografia_politica.peru_departamentos(id) ON DELETE RESTRICT,
  id_provincia     INTEGER REFERENCES geografia_politica.peru_provincias(id)    ON DELETE RESTRICT,
  id_distrito      INTEGER REFERENCES geografia_politica.peru_distritos(id)     ON DELETE RESTRICT,

  CONSTRAINT chk_postulacion_jurisdiccion_present
    CHECK (id_departamento IS NOT NULL OR id_provincia IS NOT NULL OR id_distrito IS NOT NULL),

  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (id_candidato, id_proceso_electoral)
);

CREATE INDEX IF NOT EXISTS idx_postulacion_distrito
  ON candidatos.postulacion (id_distrito) WHERE id_distrito IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_postulacion_provincia
  ON candidatos.postulacion (id_provincia) WHERE id_provincia IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_postulacion_departamento
  ON candidatos.postulacion (id_departamento) WHERE id_departamento IS NOT NULL;

CREATE TABLE IF NOT EXISTS candidatos.formula (
  id              BIGSERIAL PRIMARY KEY,
  id_candidato    BIGINT NOT NULL REFERENCES candidatos.candidato(id) ON DELETE CASCADE,
  orden           INTEGER NOT NULL,                 -- 1 = primero, 2 = segundo, etc.
  nombres         TEXT NOT NULL,
  apellidos       TEXT NOT NULL,
  dni             TEXT,
  cargo_companero TEXT,                              -- "Teniente Alcalde", "Regidor 1", etc.
  notas           TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_candidato, orden)
);

CREATE TABLE IF NOT EXISTS candidatos.evento (
  id           BIGSERIAL PRIMARY KEY,
  id_candidato BIGINT NOT NULL REFERENCES candidatos.candidato(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL,                       -- 'creado'/'calificado'/'pitch_iniciado'/'aprobado'/'rechazado'/'pausado'/'nota'/'campo_actualizado'
  user_id      UUID,                                 -- quién lo hizo (appdb.public.users.id)
  payload      JSONB,                                -- detalles libres del evento
  ocurrido_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evento_candidato
  ON candidatos.evento (id_candidato, ocurrido_en DESC);

CREATE TABLE IF NOT EXISTS candidatos.nota (
  id           BIGSERIAL PRIMARY KEY,
  id_candidato BIGINT NOT NULL REFERENCES candidatos.candidato(id) ON DELETE CASCADE,
  user_id      UUID,                                 -- autor de la nota
  texto        TEXT NOT NULL,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nota_candidato
  ON candidatos.nota (id_candidato, creado_en DESC);

CREATE TABLE IF NOT EXISTS candidatos.asset (
  id           BIGSERIAL PRIMARY KEY,
  id_candidato BIGINT NOT NULL REFERENCES candidatos.candidato(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL,                       -- 'foto'/'logo_partido'/'cv'/'otro'
  url          TEXT NOT NULL,                       -- S3/CDN absolute URL
  mime         TEXT,
  tamano_bytes BIGINT,
  metadata     JSONB,                                -- dimensiones, alt, etc.
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_candidato_tipo
  ON candidatos.asset (id_candidato, tipo);

-- ── deck.* ──────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS deck;

-- consultor_form: una fila por candidato. JSONB con todo el wizard fase-1.
-- Si una métrica se usa en queries (e.g. "votos para ganar"), se promueve
-- a columna en una migration posterior.
CREATE TABLE IF NOT EXISTS deck.consultor_form (
  id_candidato     BIGINT PRIMARY KEY REFERENCES candidatos.candidato(id) ON DELETE CASCADE,
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  ultima_seccion   TEXT,                             -- 'ficha-basica' / 'quien-es' / 'votos' / etc.
  completado       BOOLEAN NOT NULL DEFAULT false,   -- true cuando el wizard reporta listo
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por  UUID                              -- último user_id que tocó
);

-- deck_fase2: snapshots versionados del deck publicado. n filas por candidato.
CREATE TABLE IF NOT EXISTS deck.deck_fase2 (
  id              BIGSERIAL PRIMARY KEY,
  id_candidato    BIGINT NOT NULL REFERENCES candidatos.candidato(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,                  -- 1, 2, 3... ascending
  payload         JSONB NOT NULL,                    -- slides config + data resuelta al momento de publicar
  publicado_por   UUID,
  publicado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_candidato, version)
);

CREATE INDEX IF NOT EXISTS idx_deck_fase2_candidato_version
  ON deck.deck_fase2 (id_candidato, version DESC);

-- ── datos_externos.* ────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS datos_externos;

CREATE TABLE IF NOT EXISTS datos_externos.eleccion (
  id              SERIAL PRIMARY KEY,
  codigo          TEXT NOT NULL UNIQUE,             -- 'ERM2026', 'EG2021_1V', 'EG2021_2V', 'EG2026'
  nombre          TEXT NOT NULL,
  tipo            TEXT NOT NULL,                     -- 'general'/'regional_municipal'/'consulta'/'congresal'
  fecha_eleccion  DATE,
  ambito          TEXT,                              -- 'nacional'/'regional'/'municipal'/'mixta'
  notas           TEXT
);

CREATE TABLE IF NOT EXISTS datos_externos.padron_electoral (
  id BIGSERIAL PRIMARY KEY,

  -- Scope geográfico (al menos UNO no-null según ámbito del corte)
  id_departamento INTEGER REFERENCES geografia_politica.peru_departamentos(id) ON DELETE RESTRICT,
  id_provincia    INTEGER REFERENCES geografia_politica.peru_provincias(id)    ON DELETE RESTRICT,
  id_distrito     INTEGER REFERENCES geografia_politica.peru_distritos(id)     ON DELETE RESTRICT,
  CONSTRAINT chk_padron_geo_present
    CHECK (id_departamento IS NOT NULL OR id_provincia IS NOT NULL OR id_distrito IS NOT NULL),

  -- Origen del corte
  id_eleccion     INTEGER REFERENCES datos_externos.eleccion(id),
  fuente          TEXT NOT NULL,                     -- 'ONPE'/'JNE'/'RENIEC'/'INEI'
  fuente_url      TEXT,
  fecha_corte     DATE,

  -- Métricas
  poblacion_total       INTEGER CHECK (poblacion_total >= 0),
  poblacion_electoral   INTEGER CHECK (poblacion_electoral >= 0),
  votos_emitidos        INTEGER CHECK (votos_emitidos >= 0),

  ingestado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ingestado_por_user_id UUID,
  notas                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_padron_distrito_corte
  ON datos_externos.padron_electoral (id_distrito, fecha_corte DESC NULLS LAST)
  WHERE id_distrito IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_padron_provincia_corte
  ON datos_externos.padron_electoral (id_provincia, fecha_corte DESC NULLS LAST)
  WHERE id_provincia IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_padron_eleccion
  ON datos_externos.padron_electoral (id_eleccion);

COMMENT ON TABLE datos_externos.padron_electoral IS
  'Cortes históricos del padrón electoral por (geo, elección, fuente). Append-only.';

CREATE TABLE IF NOT EXISTS datos_externos.presupuesto_municipal (
  id BIGSERIAL PRIMARY KEY,
  id_distrito              INTEGER NOT NULL REFERENCES geografia_politica.peru_distritos(id) ON DELETE RESTRICT,

  anio                     INTEGER NOT NULL CHECK (anio BETWEEN 1990 AND 2100),

  -- Identificación MEF
  codigo_pliego            TEXT,                   -- UBIGEO 6 dígitos del distrito (informativo)
  codigo_unidad_ejecutora  TEXT,                   -- '301255', etc.
  nombre_entidad           TEXT,                   -- 'MUNICIPALIDAD DISTRITAL DE CARABAYLLO'

  -- Montos en Soles (NUMERIC 15,2 ≈ hasta 10 billones)
  pia                      NUMERIC(15, 2),
  pim                      NUMERIC(15, 2),
  certificacion            NUMERIC(15, 2),
  compromiso               NUMERIC(15, 2),
  devengado                NUMERIC(15, 2),
  girado                   NUMERIC(15, 2),

  fuente                   TEXT NOT NULL DEFAULT 'MEF Transparencia Económica',
  fuente_url               TEXT,
  fecha_corte              DATE,
  ingestado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
  ingestado_por_user_id    UUID,

  UNIQUE (id_distrito, anio, codigo_unidad_ejecutora)
);

CREATE INDEX IF NOT EXISTS idx_presup_distrito_anio
  ON datos_externos.presupuesto_municipal (id_distrito, anio DESC);
CREATE INDEX IF NOT EXISTS idx_presup_pim_desc
  ON datos_externos.presupuesto_municipal (anio, pim DESC NULLS LAST)
  WHERE pim IS NOT NULL;

COMMENT ON TABLE datos_externos.presupuesto_municipal IS
  'PIM/PIA/devengado por (distrito, año, unidad ejecutora). UPSERT al actualizar ejecución.';

CREATE TABLE IF NOT EXISTS datos_externos.resultado_electoral (
  id BIGSERIAL PRIMARY KEY,
  id_distrito              INTEGER REFERENCES geografia_politica.peru_distritos(id) ON DELETE RESTRICT,
  id_provincia             INTEGER REFERENCES geografia_politica.peru_provincias(id) ON DELETE RESTRICT,
  id_departamento          INTEGER REFERENCES geografia_politica.peru_departamentos(id) ON DELETE RESTRICT,
  CONSTRAINT chk_res_elec_geo_present
    CHECK (id_departamento IS NOT NULL OR id_provincia IS NOT NULL OR id_distrito IS NOT NULL),

  id_eleccion              INTEGER NOT NULL REFERENCES datos_externos.eleccion(id),
  id_organizacion_politica INTEGER REFERENCES fase_1.organizacion_politica(id) ON DELETE RESTRICT,

  -- Identificación del candidato/lista (si quieren guardarlo más detallado)
  nombre_organizacion      TEXT,                   -- por si la org_politica no está en el catálogo curado
  candidato                TEXT,                   -- nombre del candidato si aplica

  votos                    INTEGER CHECK (votos >= 0),
  porcentaje               NUMERIC(6, 3) CHECK (porcentaje BETWEEN 0 AND 100),
  posicion                 INTEGER,                -- 1 = ganador, etc.

  fuente                   TEXT NOT NULL,
  fuente_url               TEXT,
  ingestado_en             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_res_elec_distrito_eleccion
  ON datos_externos.resultado_electoral (id_distrito, id_eleccion)
  WHERE id_distrito IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_res_elec_provincia_eleccion
  ON datos_externos.resultado_electoral (id_provincia, id_eleccion)
  WHERE id_provincia IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_res_elec_org
  ON datos_externos.resultado_electoral (id_organizacion_politica);

CREATE TABLE IF NOT EXISTS datos_externos.indicador_inei (
  id BIGSERIAL PRIMARY KEY,
  id_distrito      INTEGER REFERENCES geografia_politica.peru_distritos(id) ON DELETE RESTRICT,
  id_provincia     INTEGER REFERENCES geografia_politica.peru_provincias(id) ON DELETE RESTRICT,
  id_departamento  INTEGER REFERENCES geografia_politica.peru_departamentos(id) ON DELETE RESTRICT,
  CONSTRAINT chk_ind_inei_geo_present
    CHECK (id_departamento IS NOT NULL OR id_provincia IS NOT NULL OR id_distrito IS NOT NULL),

  anio             INTEGER NOT NULL,
  indicador        TEXT NOT NULL,                  -- 'idh' / 'pobreza_monetaria' / 'nbi' / 'alfabetizacion' / 'pbi_per_capita'
  valor            NUMERIC(20, 4),
  unidad           TEXT,                            -- '%' / 'puntos' / 'soles' / etc.

  fuente           TEXT NOT NULL DEFAULT 'INEI',
  fuente_url       TEXT,
  fecha_referencia DATE,
  ingestado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (id_distrito, id_provincia, id_departamento, anio, indicador)
);

CREATE INDEX IF NOT EXISTS idx_indicador_distrito
  ON datos_externos.indicador_inei (id_distrito, indicador, anio DESC)
  WHERE id_distrito IS NOT NULL;

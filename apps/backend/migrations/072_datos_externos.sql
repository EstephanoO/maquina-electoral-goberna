-- 072_datos_externos.sql
--
-- Schema `datos_externos.*` — fuentes públicas que enriquecen el análisis
-- de Fase 2 sin depender de lo que el consultor cargue manualmente.
--
-- Frente 1: poblacion_electoral
--   Cortes históricos del padrón ONPE/JNE/RENIEC/INEI. Cada corte = una
--   fila con (geo, anio, fuente). Se preservan todos los cortes para
--   tener historial. Joineo con geografia_politica.* vía FKs.
--
-- Frente 2: presupuesto_municipal
--   PIM/PIA municipal del MEF Transparencia Económica
--   (apps5.mineco.gob.pe/transparencia). Una fila por (distrito, año,
--   unidad_ejecutora). El código pliego de 6 dígitos del MEF es el UBIGEO.
--
-- Ambas tablas son append-only: nunca se hace UPDATE de filas históricas,
-- solo se agregan cortes nuevos. Excepción: presupuesto se UPSERT cuando
-- viene la misma unidad ejecutora + año para reflejar las modificaciones
-- del PIM a lo largo del ejercicio.

CREATE SCHEMA IF NOT EXISTS datos_externos;

-- ── Población electoral (cortes históricos) ──────────────────────────
CREATE TABLE IF NOT EXISTS datos_externos.poblacion_electoral (
  id                BIGSERIAL PRIMARY KEY,

  -- Scope geográfico (al menos UNO no-null, según ámbito del corte).
  -- Permite tener datos a nivel departamento, provincia o distrito.
  id_departamento   INT REFERENCES geografia_politica.departamento(id) ON DELETE RESTRICT,
  id_provincia      INT REFERENCES geografia_politica.provincia(id)    ON DELETE RESTRICT,
  id_distrito       INT REFERENCES geografia_politica.distrito(id)     ON DELETE RESTRICT,
  CONSTRAINT chk_pob_elec_geo_present
    CHECK (id_departamento IS NOT NULL OR id_provincia IS NOT NULL OR id_distrito IS NOT NULL),

  -- Metadatos del corte ──
  anio              INT NOT NULL CHECK (anio BETWEEN 1900 AND 2100),
  fecha_corte       DATE,
  fuente            TEXT NOT NULL,           -- "ONPE", "JNE", "RENIEC", "INEI"
  fuente_url        TEXT,
  tipo_eleccion     TEXT,                    -- "general", "regional", "municipal", "consulta_popular"

  -- Métricas ──
  poblacion_total       INT CHECK (poblacion_total >= 0),
  poblacion_electoral   INT CHECK (poblacion_electoral >= 0),   -- padrón ≥18
  votos_emitidos        INT CHECK (votos_emitidos >= 0),        -- si es elección pasada

  -- Audit ──
  ingestado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ingestado_por_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notas                 TEXT
);

-- Indices por ámbito + año (las queries más comunes son "última muestra
-- de distrito X" o "evolución por departamento")
CREATE INDEX IF NOT EXISTS idx_pobelec_distrito_anio
  ON datos_externos.poblacion_electoral (id_distrito, anio DESC) WHERE id_distrito IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pobelec_provincia_anio
  ON datos_externos.poblacion_electoral (id_provincia, anio DESC) WHERE id_provincia IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pobelec_departamento_anio
  ON datos_externos.poblacion_electoral (id_departamento, anio DESC) WHERE id_departamento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pobelec_fuente_anio
  ON datos_externos.poblacion_electoral (fuente, anio DESC);

COMMENT ON TABLE datos_externos.poblacion_electoral IS
  'Cortes históricos de padrón electoral / población — append-only por (geo, anio, fuente).';

-- ── Presupuesto municipal (MEF Transparencia Económica) ──────────────
CREATE TABLE IF NOT EXISTS datos_externos.presupuesto_municipal (
  id                       BIGSERIAL PRIMARY KEY,
  id_distrito              INT NOT NULL REFERENCES geografia_politica.distrito(id) ON DELETE RESTRICT,

  anio                     INT NOT NULL CHECK (anio BETWEEN 1900 AND 2100),

  -- Identificación MEF ──
  codigo_pliego            TEXT,            -- ej "150106" (UBIGEO)
  codigo_unidad_ejecutora  TEXT,            -- ej "301255"
  nombre_entidad           TEXT,            -- "MUNICIPALIDAD DISTRITAL DE CARABAYLLO"

  -- Montos (Soles, hasta ~10 trillones cabe en 15,2)
  pia                      NUMERIC(15, 2),  -- Presupuesto Institucional Apertura
  pim                      NUMERIC(15, 2),  -- Presupuesto Institucional Modificado
  certificacion            NUMERIC(15, 2),
  compromiso               NUMERIC(15, 2),
  devengado                NUMERIC(15, 2),
  girado                   NUMERIC(15, 2),

  -- Metadatos ──
  fuente                   TEXT NOT NULL DEFAULT 'MEF Transparencia Económica',
  fuente_url               TEXT,
  fecha_corte              DATE,
  ingestado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Una unidad ejecutora por distrito-año (UPSERT al actualizar)
  UNIQUE (id_distrito, anio, codigo_unidad_ejecutora)
);

CREATE INDEX IF NOT EXISTS idx_presup_distrito_anio
  ON datos_externos.presupuesto_municipal (id_distrito, anio DESC);
CREATE INDEX IF NOT EXISTS idx_presup_pim_desc
  ON datos_externos.presupuesto_municipal (anio, pim DESC NULLS LAST)
  WHERE pim IS NOT NULL;

COMMENT ON TABLE datos_externos.presupuesto_municipal IS
  'PIM/PIA/devengado por distrito-año. UPSERT por (id_distrito, anio, codigo_unidad_ejecutora).';

-- 068_analisis_schema.sql
--
-- Base de datos de análisis político — 3 capas que crecen con el tiempo:
--
--   Capa 1: Hechos electorales (mundo real, importable de fuentes externas)
--           elecciones, resultados_electorales, indicadores_jurisdiccion,
--           historial_partidos.
--
--   Capa 2: Análisis del candidato (lo que genera el consultor con cada deck)
--           analisis (master row), hallazgos, riesgos, oportunidades,
--           competidores, recomendaciones, kpis.
--           Se popula via POST /api/consultor/decks { ..., structured: {...} }.
--
--   Capa 3: Conocimiento agregado (jobs nightly destilan capa 2)
--           patrones_jurisdiccionales, playbook_tacticas, benchmarks.
--
-- Esta migración SOLO ESTRUCTURA tablas. Los seed/import de datos viene
-- después en migraciones aparte.

CREATE SCHEMA IF NOT EXISTS analisis;

-- ─────────────────────────────────────────────────────────────────────
-- CAPA 1 — Hechos electorales (mundo real, externos)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analisis.elecciones (
  id            SERIAL PRIMARY KEY,
  id_pais       INTEGER NOT NULL REFERENCES catalogos.pais(id),
  codigo        TEXT NOT NULL,                      -- ERM-2026, EG-2026, RC-2025
  nombre        TEXT NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN (
                  'general', 'regional_municipal', 'congresal',
                  'referendum', 'consulta_popular', 'revocatoria', 'otro'
                )),
  vuelta        SMALLINT,                           -- 1, 2, NULL si no aplica
  fecha         DATE,
  estado        TEXT NOT NULL DEFAULT 'planificada' CHECK (estado IN (
                  'planificada', 'abierta', 'cerrada'
                )),
  fuente        TEXT,                                -- ONPE, JNE, INFOGOB
  fuente_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_pais, codigo)
);

COMMENT ON TABLE analisis.elecciones IS
  'Catálogo de procesos electorales (presentes/futuros/pasados). Llenable on-demand.';

CREATE TABLE IF NOT EXISTS analisis.resultados_electorales (
  id                       BIGSERIAL PRIMARY KEY,
  eleccion_id              INTEGER NOT NULL REFERENCES analisis.elecciones(id) ON DELETE CASCADE,
  id_cargo_gobierno        INTEGER REFERENCES catalogos.cargo_gobierno(id),
  -- Jurisdicción (Perú; abierto a otros países si extendemos catálogos)
  id_departamento          INTEGER REFERENCES geografia_politica.peru_departamentos(id),
  id_provincia             INTEGER REFERENCES geografia_politica.peru_provincias(id),
  id_distrito              INTEGER REFERENCES geografia_politica.peru_distritos(id),
  -- Candidato + partido
  candidato_nombre         TEXT,
  id_organizacion_politica INTEGER REFERENCES catalogos.organizacion_politica(id),
  -- Resultados
  votos                    INTEGER,
  porcentaje               NUMERIC(5,2),
  ganador                  BOOLEAN DEFAULT false,
  -- Trazabilidad
  fuente                   TEXT,                     -- INFOGOB, ONPE
  fuente_url               TEXT,
  imported_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_res_eleccion       ON analisis.resultados_electorales (eleccion_id);
CREATE INDEX IF NOT EXISTS idx_res_partido        ON analisis.resultados_electorales (id_organizacion_politica);
CREATE INDEX IF NOT EXISTS idx_res_distrito       ON analisis.resultados_electorales (id_distrito);
CREATE INDEX IF NOT EXISTS idx_res_provincia      ON analisis.resultados_electorales (id_provincia);
CREATE INDEX IF NOT EXISTS idx_res_departamento   ON analisis.resultados_electorales (id_departamento);

CREATE TABLE IF NOT EXISTS analisis.indicadores_jurisdiccion (
  id                BIGSERIAL PRIMARY KEY,
  id_departamento   INTEGER REFERENCES geografia_politica.peru_departamentos(id),
  id_provincia      INTEGER REFERENCES geografia_politica.peru_provincias(id),
  id_distrito       INTEGER REFERENCES geografia_politica.peru_distritos(id),
  indicador         TEXT NOT NULL,                  -- poblacion, NSE_A_pct, pobreza_pct, padron_electoral
  valor             NUMERIC(20,4),
  unidad            TEXT,                            -- personas, %, USD, etc.
  fecha_referencia  DATE,                            -- censo 2017, padron 2024Q4
  fuente            TEXT,                            -- INEI, RENIEC, ONPE
  fuente_url        TEXT,
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ind_distrito     ON analisis.indicadores_jurisdiccion (id_distrito);
CREATE INDEX IF NOT EXISTS idx_ind_indicador    ON analisis.indicadores_jurisdiccion (indicador);

CREATE TABLE IF NOT EXISTS analisis.historial_partidos (
  id                       BIGSERIAL PRIMARY KEY,
  id_organizacion_politica INTEGER NOT NULL REFERENCES catalogos.organizacion_politica(id),
  id_departamento          INTEGER REFERENCES geografia_politica.peru_departamentos(id),
  id_provincia             INTEGER REFERENCES geografia_politica.peru_provincias(id),
  id_distrito              INTEGER REFERENCES geografia_politica.peru_distritos(id),
  eleccion_id              INTEGER REFERENCES analisis.elecciones(id) ON DELETE CASCADE,
  cargo_codigo             TEXT,
  porcentaje               NUMERIC(5,2),
  ganador                  BOOLEAN,
  imported_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hist_partido    ON analisis.historial_partidos (id_organizacion_politica);
CREATE INDEX IF NOT EXISTS idx_hist_distrito   ON analisis.historial_partidos (id_distrito);

-- ─────────────────────────────────────────────────────────────────────
-- CAPA 2 — Análisis del candidato (estructurado, escrito por upload_deck)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analisis.analisis (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id         INTEGER NOT NULL,             -- → candidatos.candidato.id
  campaign_id          UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  deck_id              UUID REFERENCES public.decks(id) ON DELETE SET NULL,
  type                 TEXT NOT NULL CHECK (type IN (
                         'diagnostico', 'analisis', 'plan', 'episodico', 'otro'
                       )),
  title                TEXT NOT NULL,
  summary              TEXT,                          -- abstract searchable
  uploaded_by_user_id  UUID REFERENCES public.users(id),
  fecha_corte          DATE,                          -- a qué fecha refiere el análisis
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analisis_candidato  ON analisis.analisis (candidato_id);
CREATE INDEX IF NOT EXISTS idx_analisis_campaign   ON analisis.analisis (campaign_id);
CREATE INDEX IF NOT EXISTS idx_analisis_deck       ON analisis.analisis (deck_id);
CREATE INDEX IF NOT EXISTS idx_analisis_type       ON analisis.analisis (type);
CREATE INDEX IF NOT EXISTS idx_analisis_created    ON analisis.analisis (created_at DESC);

-- Hallazgos: hechos detectados sobre candidato/territorio (FODA-like + libre)
CREATE TABLE IF NOT EXISTS analisis.hallazgos (
  id           BIGSERIAL PRIMARY KEY,
  analisis_id  UUID NOT NULL REFERENCES analisis.analisis(id) ON DELETE CASCADE,
  categoria    TEXT NOT NULL CHECK (categoria IN (
                 'fortaleza', 'debilidad', 'oportunidad', 'amenaza', 'contexto'
               )),
  texto        TEXT NOT NULL,
  evidencia    TEXT,                                  -- "encuesta IPSOS abr 2026", obs propia
  peso         NUMERIC(3,2) CHECK (peso BETWEEN 0 AND 1),
  tags         TEXT[],                                 -- ['comunicacion','marca','base-electoral']
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hallazgos_analisis  ON analisis.hallazgos (analisis_id);
CREATE INDEX IF NOT EXISTS idx_hallazgos_categoria ON analisis.hallazgos (categoria);
CREATE INDEX IF NOT EXISTS idx_hallazgos_tags      ON analisis.hallazgos USING GIN (tags);

-- Riesgos identificados
CREATE TABLE IF NOT EXISTS analisis.riesgos (
  id            BIGSERIAL PRIMARY KEY,
  analisis_id   UUID NOT NULL REFERENCES analisis.analisis(id) ON DELETE CASCADE,
  riesgo        TEXT NOT NULL,
  severidad     TEXT NOT NULL CHECK (severidad IN ('baja','media','alta','critica')),
  probabilidad  TEXT CHECK (probabilidad IN ('baja','media','alta')),
  mitigacion    TEXT,
  responsable   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_riesgos_analisis  ON analisis.riesgos (analisis_id);
CREATE INDEX IF NOT EXISTS idx_riesgos_severidad ON analisis.riesgos (severidad);

-- Oportunidades + ventana temporal
CREATE TABLE IF NOT EXISTS analisis.oportunidades (
  id                    BIGSERIAL PRIMARY KEY,
  analisis_id           UUID NOT NULL REFERENCES analisis.analisis(id) ON DELETE CASCADE,
  oportunidad           TEXT NOT NULL,
  ventana_temporal      TEXT,                         -- "antes de ago 2026", "en el debate"
  recursos_necesarios   TEXT,
  impacto_esperado      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oport_analisis ON analisis.oportunidades (analisis_id);

-- Competidores: análisis del oponente
CREATE TABLE IF NOT EXISTS analisis.competidores (
  id                  BIGSERIAL PRIMARY KEY,
  analisis_id         UUID NOT NULL REFERENCES analisis.analisis(id) ON DELETE CASCADE,
  partido_codigo      TEXT,                            -- → catalogos.organizacion_politica.codigo
  partido_nombre      TEXT,                            -- redundante para evitar JOIN si el código no está
  candidato_rival     TEXT,
  fortaleza_relativa  SMALLINT CHECK (fortaleza_relativa BETWEEN 1 AND 10),
  jurisdiccion_clave  TEXT,
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_analisis ON analisis.competidores (analisis_id);
CREATE INDEX IF NOT EXISTS idx_comp_partido  ON analisis.competidores (partido_codigo);

-- Recomendaciones / acciones propuestas por el consultor
CREATE TABLE IF NOT EXISTS analisis.recomendaciones (
  id                  BIGSERIAL PRIMARY KEY,
  analisis_id         UUID NOT NULL REFERENCES analisis.analisis(id) ON DELETE CASCADE,
  accion              TEXT NOT NULL,
  area                TEXT CHECK (area IN (
                        'territorio','digital','datos','comunicacion',
                        'organizacion','financiamiento','legal','otro'
                      )),
  plazo               TEXT CHECK (plazo IN ('inmediato','corto','mediano','largo')),
  recursos_estimados  TEXT,
  kpi_objetivo        TEXT,
  prioridad           SMALLINT CHECK (prioridad BETWEEN 1 AND 5),
  estado              TEXT NOT NULL DEFAULT 'propuesta' CHECK (estado IN (
                        'propuesta','aceptada','en_ejecucion','completada','descartada'
                      )),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reco_analisis  ON analisis.recomendaciones (analisis_id);
CREATE INDEX IF NOT EXISTS idx_reco_area      ON analisis.recomendaciones (area);
CREATE INDEX IF NOT EXISTS idx_reco_estado    ON analisis.recomendaciones (estado);

-- KPIs / metas del candidato según el análisis
CREATE TABLE IF NOT EXISTS analisis.kpis (
  id              BIGSERIAL PRIMARY KEY,
  analisis_id     UUID NOT NULL REFERENCES analisis.analisis(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,                       -- "Reconocimiento de marca", "Cobertura territorial"
  valor_actual    NUMERIC,
  valor_objetivo  NUMERIC,
  unidad          TEXT,                                 -- %, votos, distritos
  fecha_objetivo  DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kpis_analisis ON analisis.kpis (analisis_id);

-- ─────────────────────────────────────────────────────────────────────
-- CAPA 3 — Conocimiento agregado (jobs nightly llenan estas tablas)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analisis.patrones_jurisdiccionales (
  id                    BIGSERIAL PRIMARY KEY,
  -- Filtros
  ambito_geografico     TEXT CHECK (ambito_geografico IN ('distrito','provincia','departamento','pais')),
  region_macro          TEXT,                          -- norte | sur | centro | oriente | costa | sierra | selva
  cargo_codigo          TEXT,                          -- → catalogos.cargo_gobierno.codigo
  -- Patrón
  patron                TEXT NOT NULL,                 -- "Riesgo de baja participación juvenil"
  categoria             TEXT,                          -- mismo set que hallazgos.categoria
  -- Métricas
  frecuencia            INTEGER NOT NULL,
  total_analisis        INTEGER NOT NULL,
  evidencia_analisis_ids UUID[],
  last_computed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patrones_cargo ON analisis.patrones_jurisdiccionales (cargo_codigo);

CREATE TABLE IF NOT EXISTS analisis.playbook_tacticas (
  id                    BIGSERIAL PRIMARY KEY,
  tactica               TEXT NOT NULL,                 -- "Visita semanal a mercados"
  contexto              TEXT,                           -- "Cuando el competidor tiene >40% en plazas urbanas"
  area                  TEXT CHECK (area IN (
                          'territorio','digital','datos','comunicacion',
                          'organizacion','financiamiento','legal','otro'
                        )),
  veces_aplicada        INTEGER DEFAULT 0,
  exito_promedio        NUMERIC(3,2) CHECK (exito_promedio BETWEEN 0 AND 1),
  fuentes_analisis_ids  UUID[],
  last_computed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_playbook_area ON analisis.playbook_tacticas (area);

CREATE TABLE IF NOT EXISTS analisis.benchmarks (
  id                BIGSERIAL PRIMARY KEY,
  cargo_codigo      TEXT NOT NULL,
  ambito_geografico TEXT NOT NULL CHECK (ambito_geografico IN (
                      'distrito','provincia','departamento','pais'
                    )),
  kpi_nombre        TEXT NOT NULL,
  valor_p10         NUMERIC,
  valor_p50         NUMERIC,
  valor_p90         NUMERIC,
  unidad            TEXT,
  n_muestras        INTEGER NOT NULL,
  last_computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cargo_codigo, ambito_geografico, kpi_nombre)
);

-- ─────────────────────────────────────────────────────────────────────
-- COMMENTS para documentar intención
-- ─────────────────────────────────────────────────────────────────────

COMMENT ON SCHEMA analisis IS
  'Base de datos de análisis político — 3 capas (hechos externos, análisis por candidato, conocimiento agregado).';
COMMENT ON TABLE analisis.analisis IS
  'Master row por cada deck/análisis del consultor. Linkea con public.decks y candidatos.candidato.';
COMMENT ON TABLE analisis.hallazgos IS
  'Hechos detectados en cada análisis (FODA + libre). Source para capa 3 patrones.';
COMMENT ON TABLE analisis.benchmarks IS
  'Capa 3 — agregación de capa 2. Computada nightly.';

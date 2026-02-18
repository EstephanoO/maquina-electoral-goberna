-- 001b_baseline_data_tables.sql
-- Creates the baseline data tables (forms, agent_locations_live) that were
-- originally created outside the migration system.
-- These MUST exist before migration 002 which ALTERs them.
-- Using IF NOT EXISTS so this is safe to run on existing production DBs.

-- 1) forms: legacy fixed-column survey data table
CREATE TABLE IF NOT EXISTS public.forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  fecha TIMESTAMPTZ NOT NULL,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  zona TEXT NOT NULL,
  candidate TEXT NOT NULL DEFAULT '',
  encuestador TEXT NOT NULL,
  encuestador_id TEXT NOT NULL,
  candidato_preferido TEXT NOT NULL,
  client_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  home_maps_url TEXT,
  polling_place_url TEXT,
  comentarios TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_forms_client_id ON public.forms (client_id);
CREATE INDEX IF NOT EXISTS idx_forms_created_at ON public.forms (created_at);
CREATE INDEX IF NOT EXISTS idx_forms_encuestador_created_at ON public.forms (encuestador_id, created_at);

-- 2) agent_locations_live: real-time agent GPS positions (upsert by agent_id PK)
CREATE TABLE IF NOT EXISTS public.agent_locations_live (
  agent_id TEXT PRIMARY KEY,
  seq BIGINT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  battery DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_locations_live_seq ON public.agent_locations_live (seq DESC);
CREATE INDEX IF NOT EXISTS idx_agent_locations_live_updated_at ON public.agent_locations_live (updated_at DESC);

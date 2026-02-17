-- 009_campaign_priority_zones.sql
-- Purpose: Tables for campaign-specific priority geographic zones.
-- campaign_priority_zones: references to base map (peru_departamentos/provincias/distritos)
-- campaign_custom_zones: own geometry for sectors/subsectors not in INEI base map
-- Both tables are campaign_id scoped for multi-tenant isolation.
-- QGIS connects via SSH tunnel for direct editing; initial load via import script.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- 1) campaign_priority_zones — lightweight refs to base map
-- ============================================================

CREATE TABLE IF NOT EXISTS public.campaign_priority_zones (
  id            SERIAL PRIMARY KEY,
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  zone_level    TEXT NOT NULL CHECK (zone_level IN ('departamento', 'provincia', 'distrito')),
  zone_code     TEXT NOT NULL,
  priority      INT NOT NULL DEFAULT 1,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (campaign_id, zone_level, zone_code)
);

CREATE INDEX IF NOT EXISTS idx_cpz_campaign
  ON public.campaign_priority_zones (campaign_id);

CREATE INDEX IF NOT EXISTS idx_cpz_campaign_level
  ON public.campaign_priority_zones (campaign_id, zone_level);

COMMENT ON TABLE public.campaign_priority_zones IS
  'Priority zones per campaign — references base map tables (peru_departamentos/provincias/distritos) by zone_code';
COMMENT ON COLUMN public.campaign_priority_zones.zone_level IS
  'Administrative level: departamento | provincia | distrito';
COMMENT ON COLUMN public.campaign_priority_zones.zone_code IS
  'Geographic code: CODDEP (2 chars) for departamento, CODDEP||CODPROV (4 chars) for provincia, UBIGEO (6 chars) for distrito';

-- ============================================================
-- 2) campaign_custom_zones — own geometry (sectors/subsectors)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.campaign_custom_zones (
  id            SERIAL PRIMARY KEY,
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  zone_level    TEXT NOT NULL CHECK (zone_level IN ('sector', 'subsector')),
  zone_code     TEXT NOT NULL,
  zone_name     TEXT,
  sector        INT,
  subsector     INT,
  parent_code   TEXT NOT NULL,
  population    INT,
  metadata      JSONB DEFAULT '{}',
  geom          GEOMETRY(MultiPolygon, 4326) NOT NULL,
  source        TEXT NOT NULL DEFAULT 'import' CHECK (source IN ('import', 'arcgis', 'qgis', 'manual')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (campaign_id, zone_level, zone_code, sector, subsector)
);

CREATE INDEX IF NOT EXISTS idx_ccz_campaign
  ON public.campaign_custom_zones (campaign_id);

CREATE INDEX IF NOT EXISTS idx_ccz_campaign_level
  ON public.campaign_custom_zones (campaign_id, zone_level);

CREATE INDEX IF NOT EXISTS idx_ccz_parent
  ON public.campaign_custom_zones (parent_code);

CREATE INDEX IF NOT EXISTS idx_ccz_geom
  ON public.campaign_custom_zones USING GIST (geom);

COMMENT ON TABLE public.campaign_custom_zones IS
  'Custom geographic zones per campaign with own geometry — sectors/subsectors not in INEI base map';
COMMENT ON COLUMN public.campaign_custom_zones.zone_code IS
  'UBIGEO of the parent distrito';
COMMENT ON COLUMN public.campaign_custom_zones.parent_code IS
  'UBIGEO of the containing distrito';
COMMENT ON COLUMN public.campaign_custom_zones.geom IS
  'MultiPolygon geometry in EPSG:4326 (WGS84)';
COMMENT ON COLUMN public.campaign_custom_zones.source IS
  'Data origin: import (script), arcgis (sync), qgis (direct edit), manual';

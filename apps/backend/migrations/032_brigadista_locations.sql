-- Migration 032: brigadista_locations table for QGIS-managed brigadista point markers
--
-- The geographer connects directly to PostGIS via QGIS and drops Point markers
-- for each brigadista's home address (domicilio) and workplace (centro de trabajo).
-- Points are differentiated by agent_role (agente_campo / agente_digital) and
-- location_type (domicilio / centro_trabajo).
--
-- The pg_notify trigger reuses the notify_geo_change() function from migration 031
-- so that edits propagate near-realtime to the dashboard via SSE.

BEGIN;

-- ── Table ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.brigadista_locations (
  id            SERIAL PRIMARY KEY,
  campaign_id   UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  agent_name    TEXT NOT NULL DEFAULT '',
  agent_role    TEXT NOT NULL DEFAULT 'agente_campo'
                CHECK (agent_role IN ('agente_campo', 'agente_digital')),
  location_type TEXT NOT NULL DEFAULT 'domicilio'
                CHECK (location_type IN ('domicilio', 'centro_trabajo')),
  notes         TEXT DEFAULT '',
  -- QGIS will edit in EPSG:4326 (standard lon/lat)
  geom          GEOMETRY(Point, 4326) NOT NULL,
  -- Pre-projected for Tegola (avoid on-the-fly ST_Transform)
  geom_3857     GEOMETRY(Point, 3857),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Spatial indexes ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bl_geom_3857
  ON public.brigadista_locations USING GIST (geom_3857);

CREATE INDEX IF NOT EXISTS idx_bl_campaign
  ON public.brigadista_locations (campaign_id);

-- ── Auto-project geom → geom_3857 trigger ───────────────────────────

CREATE OR REPLACE FUNCTION public.bl_sync_geom_3857()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geom_3857 := ST_Transform(NEW.geom, 3857);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bl_sync_geom_3857 ON public.brigadista_locations;
CREATE TRIGGER trg_bl_sync_geom_3857
  BEFORE INSERT OR UPDATE OF geom ON public.brigadista_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.bl_sync_geom_3857();

-- ── pg_notify trigger (reuses notify_geo_change from migration 031) ──

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notify_bl'
  ) THEN
    CREATE TRIGGER trg_notify_bl
      AFTER INSERT OR UPDATE OR DELETE ON public.brigadista_locations
      FOR EACH ROW EXECUTE FUNCTION notify_geo_change();
  END IF;
END $$;

-- ── QGIS-friendly view (optional, provides human-readable editing) ───
-- The geographer can also edit the table directly, but this view adds
-- computed lon/lat columns for reference.

CREATE OR REPLACE VIEW public.qgis_brigadista_locations AS
SELECT
  id,
  campaign_id,
  agent_name,
  agent_role,
  location_type,
  notes,
  ST_X(geom) AS lon,
  ST_Y(geom) AS lat,
  geom,
  created_at,
  updated_at
FROM public.brigadista_locations;

-- ── Planner stats ────────────────────────────────────────────────────

ANALYZE public.brigadista_locations;

COMMIT;

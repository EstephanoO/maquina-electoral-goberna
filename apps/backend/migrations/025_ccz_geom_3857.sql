-- 025_ccz_geom_3857.sql
-- Add pre-projected EPSG:3857 column to campaign_custom_zones
-- so Tegola can query geom_3857 directly (like peru_departamentos/provincias/distritos)
-- instead of doing ST_Transform(geom, 3857) on every tile request.

BEGIN;

-- 1. Add nullable column (no table rewrite, instant)
ALTER TABLE public.campaign_custom_zones
  ADD COLUMN IF NOT EXISTS geom_3857 GEOMETRY(MultiPolygon, 3857);

-- 2. Backfill existing rows
UPDATE public.campaign_custom_zones
  SET geom_3857 = ST_Transform(geom, 3857)
  WHERE geom_3857 IS NULL;

-- 3. GIST spatial index on the new column
CREATE INDEX IF NOT EXISTS idx_ccz_geom_3857
  ON public.campaign_custom_zones USING GIST (geom_3857);

-- 4. Trigger function: auto-compute geom_3857 on INSERT or UPDATE of geom
CREATE OR REPLACE FUNCTION public.ccz_sync_geom_3857()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geom_3857 := ST_Transform(NEW.geom, 3857);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger (fires before INSERT or UPDATE that touches geom)
DROP TRIGGER IF EXISTS trg_ccz_sync_geom_3857 ON public.campaign_custom_zones;
CREATE TRIGGER trg_ccz_sync_geom_3857
  BEFORE INSERT OR UPDATE OF geom ON public.campaign_custom_zones
  FOR EACH ROW
  EXECUTE FUNCTION public.ccz_sync_geom_3857();

-- 6. Refresh planner stats
ANALYZE public.campaign_custom_zones;

COMMIT;

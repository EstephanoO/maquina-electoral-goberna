-- Migration 031: pg_notify triggers for near-realtime QGIS → dashboard tile invalidation
--
-- When the geographer edits priority zones or custom sectors in QGIS,
-- these triggers fire pg_notify('geo_change', 'campaign_id:table:operation').
-- The backend listens on this channel and bumps a Redis version counter,
-- which invalidates tile ETags and triggers SSE events to connected dashboards.

-- ── Trigger function ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_geo_change() RETURNS trigger AS $$
DECLARE
  cid text;
BEGIN
  -- Extract campaign_id from the affected row
  IF TG_OP = 'DELETE' THEN
    cid := OLD.campaign_id::text;
  ELSE
    cid := NEW.campaign_id::text;
  END IF;

  -- Payload format: campaign_id:table_name:operation
  PERFORM pg_notify('geo_change', cid || ':' || TG_TABLE_NAME || ':' || TG_OP);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ── Trigger on campaign_priority_zones ──────────────────────────────
-- Fires when the geographer marks/unmarks/updates priority zones via QGIS views
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notify_cpz'
  ) THEN
    CREATE TRIGGER trg_notify_cpz
      AFTER INSERT OR UPDATE OR DELETE ON campaign_priority_zones
      FOR EACH ROW EXECUTE FUNCTION notify_geo_change();
  END IF;
END $$;

-- ── Trigger on campaign_custom_zones ────────────────────────────────
-- Fires when the geographer draws/edits/deletes custom sector polygons in QGIS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notify_ccz'
  ) THEN
    CREATE TRIGGER trg_notify_ccz
      AFTER INSERT OR UPDATE OR DELETE ON campaign_custom_zones
      FOR EACH ROW EXECUTE FUNCTION notify_geo_change();
  END IF;
END $$;

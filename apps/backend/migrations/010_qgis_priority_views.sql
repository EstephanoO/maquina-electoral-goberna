-- Migration 010: QGIS-friendly views for priority zones
-- These views allow QGIS to visualize and EDIT priority zones directly
-- via INSTEAD OF UPDATE triggers.
--
-- Flow: QGIS edits is_priority/priority on view → trigger INSERT/DELETE/UPDATE on campaign_priority_zones
--       → Tegola serves updated tiles (5s cache) → Web map reflects changes
--
-- NOTE: peru_departamentos/provincias/distritos are GIS tables imported externally.
-- On fresh CI databases these tables don't exist, so the migration skips view creation
-- gracefully. The trigger functions are always created (harmless without views).

-- ============================================================================
-- 1. Trigger functions (always created — safe even without views)
-- ============================================================================

-- Departamentos trigger function
CREATE OR REPLACE FUNCTION fn_qgis_dep_priority_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_priority = true AND (OLD.is_priority = false OR OLD.priority_id IS NULL) THEN
    INSERT INTO campaign_priority_zones (campaign_id, zone_level, zone_code, priority)
    VALUES (NEW.campaign_id, 'departamento', NEW.zone_code, COALESCE(NEW.priority, 1))
    ON CONFLICT (campaign_id, zone_level, zone_code) DO UPDATE SET priority = EXCLUDED.priority;
  ELSIF NEW.is_priority = false AND OLD.is_priority = true AND OLD.priority_id IS NOT NULL THEN
    DELETE FROM campaign_priority_zones WHERE id = OLD.priority_id;
  ELSIF NEW.priority IS DISTINCT FROM OLD.priority AND OLD.priority_id IS NOT NULL THEN
    UPDATE campaign_priority_zones SET priority = NEW.priority WHERE id = OLD.priority_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Provincias trigger function
CREATE OR REPLACE FUNCTION fn_qgis_prov_priority_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_priority = true AND (OLD.is_priority = false OR OLD.priority_id IS NULL) THEN
    INSERT INTO campaign_priority_zones (campaign_id, zone_level, zone_code, priority)
    VALUES (NEW.campaign_id, 'provincia', NEW.zone_code, COALESCE(NEW.priority, 1))
    ON CONFLICT (campaign_id, zone_level, zone_code) DO UPDATE SET priority = EXCLUDED.priority;
  ELSIF NEW.is_priority = false AND OLD.is_priority = true AND OLD.priority_id IS NOT NULL THEN
    DELETE FROM campaign_priority_zones WHERE id = OLD.priority_id;
  ELSIF NEW.priority IS DISTINCT FROM OLD.priority AND OLD.priority_id IS NOT NULL THEN
    UPDATE campaign_priority_zones SET priority = NEW.priority WHERE id = OLD.priority_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Distritos trigger function
CREATE OR REPLACE FUNCTION fn_qgis_dist_priority_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_priority = true AND (OLD.is_priority = false OR OLD.priority_id IS NULL) THEN
    INSERT INTO campaign_priority_zones (campaign_id, zone_level, zone_code, priority)
    VALUES (NEW.campaign_id, 'distrito', NEW.zone_code, COALESCE(NEW.priority, 1))
    ON CONFLICT (campaign_id, zone_level, zone_code) DO UPDATE SET priority = EXCLUDED.priority;
  ELSIF NEW.is_priority = false AND OLD.is_priority = true AND OLD.priority_id IS NOT NULL THEN
    DELETE FROM campaign_priority_zones WHERE id = OLD.priority_id;
  ELSIF NEW.priority IS DISTINCT FROM OLD.priority AND OLD.priority_id IS NOT NULL THEN
    UPDATE campaign_priority_zones SET priority = NEW.priority WHERE id = OLD.priority_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. Views + triggers (only created if GIS base tables exist)
-- ============================================================================

DO $$
BEGIN
  -- Only create views if the peru GIS tables have been imported
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'peru_departamentos') THEN

    -- Departamentos view
    CREATE OR REPLACE VIEW v_qgis_dep_priority AS
    SELECT
      d.gid,
      d.coddep AS zone_code,
      d.nomdep AS nombre,
      'departamento'::text AS zone_level,
      c.id AS campaign_id,
      c.name AS campaign_name,
      cpz.id AS priority_id,
      cpz.priority,
      CASE WHEN cpz.id IS NOT NULL THEN true ELSE false END AS is_priority,
      d.geom
    FROM peru_departamentos d
    CROSS JOIN campaigns c
    LEFT JOIN campaign_priority_zones cpz
      ON cpz.zone_code = d.coddep
      AND cpz.zone_level = 'departamento'
      AND cpz.campaign_id = c.id;

    DROP TRIGGER IF EXISTS trg_qgis_dep_priority_update ON v_qgis_dep_priority;
    CREATE TRIGGER trg_qgis_dep_priority_update
    INSTEAD OF UPDATE ON v_qgis_dep_priority
    FOR EACH ROW EXECUTE FUNCTION fn_qgis_dep_priority_update();

    RAISE NOTICE 'Created v_qgis_dep_priority view + trigger';
  ELSE
    RAISE NOTICE 'Skipping v_qgis_dep_priority: peru_departamentos table not found';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'peru_provincias') THEN

    -- Provincias view
    CREATE OR REPLACE VIEW v_qgis_prov_priority AS
    SELECT
      p.gid,
      (p.coddep || p.codprov) AS zone_code,
      p.nomprov AS nombre,
      'provincia'::text AS zone_level,
      c.id AS campaign_id,
      c.name AS campaign_name,
      cpz.id AS priority_id,
      cpz.priority,
      CASE WHEN cpz.id IS NOT NULL THEN true ELSE false END AS is_priority,
      p.geom
    FROM peru_provincias p
    CROSS JOIN campaigns c
    LEFT JOIN campaign_priority_zones cpz
      ON cpz.zone_code = (p.coddep || p.codprov)
      AND cpz.zone_level = 'provincia'
      AND cpz.campaign_id = c.id;

    DROP TRIGGER IF EXISTS trg_qgis_prov_priority_update ON v_qgis_prov_priority;
    CREATE TRIGGER trg_qgis_prov_priority_update
    INSTEAD OF UPDATE ON v_qgis_prov_priority
    FOR EACH ROW EXECUTE FUNCTION fn_qgis_prov_priority_update();

    RAISE NOTICE 'Created v_qgis_prov_priority view + trigger';
  ELSE
    RAISE NOTICE 'Skipping v_qgis_prov_priority: peru_provincias table not found';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'peru_distritos') THEN

    -- Distritos view
    CREATE OR REPLACE VIEW v_qgis_dist_priority AS
    SELECT
      d.gid,
      d.ubigeo AS zone_code,
      d.nomdist AS nombre,
      'distrito'::text AS zone_level,
      c.id AS campaign_id,
      c.name AS campaign_name,
      cpz.id AS priority_id,
      cpz.priority,
      CASE WHEN cpz.id IS NOT NULL THEN true ELSE false END AS is_priority,
      d.geom
    FROM peru_distritos d
    CROSS JOIN campaigns c
    LEFT JOIN campaign_priority_zones cpz
      ON cpz.zone_code = d.ubigeo
      AND cpz.zone_level = 'distrito'
      AND cpz.campaign_id = c.id;

    DROP TRIGGER IF EXISTS trg_qgis_dist_priority_update ON v_qgis_dist_priority;
    CREATE TRIGGER trg_qgis_dist_priority_update
    INSTEAD OF UPDATE ON v_qgis_dist_priority
    FOR EACH ROW EXECUTE FUNCTION fn_qgis_dist_priority_update();

    RAISE NOTICE 'Created v_qgis_dist_priority view + trigger';
  ELSE
    RAISE NOTICE 'Skipping v_qgis_dist_priority: peru_distritos table not found';
  END IF;
END $$;

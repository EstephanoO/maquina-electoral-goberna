-- =============================================================================
-- Migration: GeoJSON fallback files → campaign_priority_zones + campaign_custom_zones
-- =============================================================================
-- This script migrates all hardcoded GeoJSON campaign overlays into the proper
-- database tables so Tegola serves them as vector tiles. After this migration,
-- the static GeoJSON files and frontend fallback code can be removed.
--
-- Campaign: giovanna-castagnino (27b0f27f-23fc-4382-b9f2-53db1bb83a5d)
--   - nieto_giovanna.geojson → 18 distrito priority zones + 6 sector custom zones
--   - bisnieto_giovanna_v1.geojson → 3 subsector custom zones
--
-- Campaign: rocio-porras (00f81464-350d-4a01-9d63-98461613a894)
--   - abuelo_rocio.geojson → 3 departamento priority zones (2 already exist)
--   - padre_rocio.geojson → 5 provincia priority zones
--   - hijo_rocio.geojson → 17 distrito priority zones
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. GIOVANNA-CASTAGNINO: distrito priority zones (nieto_giovanna.geojson)
--    18 districts across ICA and LIMA (features WITHOUT SECTOR field)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO campaign_priority_zones (campaign_id, zone_level, zone_code, priority)
VALUES
  -- ICA / Chincha
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '110201', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '110207', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '110210', 1),
  -- ICA / Pisco
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '110501', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '110507', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '110508', 1),
  -- LIMA / Lima
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '150102', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '150139', 1),
  -- LIMA / Barranca
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '150201', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '150202', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '150203', 1),
  -- LIMA / Huaral
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '150601', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '150604', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '150605', 1),
  -- LIMA / Huaura
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '150801', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '150805', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '150806', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'distrito', '150810', 1)
ON CONFLICT (campaign_id, zone_level, zone_code) DO NOTHING;

-- Also insert the parent departamentos and provincias for hierarchical drill-down display
-- Departamentos: ICA (11), LIMA (15)
INSERT INTO campaign_priority_zones (campaign_id, zone_level, zone_code, priority)
VALUES
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'departamento', '11', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'departamento', '15', 1)
ON CONFLICT (campaign_id, zone_level, zone_code) DO NOTHING;

-- Provincias: Chincha (1102), Pisco (1105), Lima (1501), Barranca (1502), Huaral (1506), Huaura (1508)
INSERT INTO campaign_priority_zones (campaign_id, zone_level, zone_code, priority)
VALUES
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'provincia', '1102', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'provincia', '1105', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'provincia', '1501', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'provincia', '1502', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'provincia', '1506', 1),
  ('27b0f27f-23fc-4382-b9f2-53db1bb83a5d', 'provincia', '1508', 1)
ON CONFLICT (campaign_id, zone_level, zone_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. GIOVANNA-CASTAGNINO: sector custom zones (nieto_giovanna.geojson)
--    6 sectors within Puente Piedra (150125) — custom geometry from GeoJSON
--    These use the actual district polygon subdivided, need geometry from
--    the source GeoJSON — we'll insert as geometry copied from peru_distritos
--    and let the import script handle the actual custom geometries
-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE: Sectors and subsectors require actual geometry from the GeoJSON files.
-- These CANNOT be inserted via pure SQL — they need the import_priority_zones.ts
-- script or a geometry-aware import. We'll handle this separately.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ROCIO-PORRAS: departamento priority zones (abuelo_rocio.geojson)
--    3 departments: AREQUIPA (04), HUANUCO (10), LIMA (15)
--    DB already has 07 and 15, need to add 04 and 10, remove 07
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove dep 07 (JUNIN) which is NOT in the GeoJSON — was wrong data
DELETE FROM campaign_priority_zones
WHERE campaign_id = '00f81464-350d-4a01-9d63-98461613a894'
  AND zone_level = 'departamento'
  AND zone_code = '07';

-- Insert correct ones
INSERT INTO campaign_priority_zones (campaign_id, zone_level, zone_code, priority)
VALUES
  ('00f81464-350d-4a01-9d63-98461613a894', 'departamento', '04', 1),  -- AREQUIPA
  ('00f81464-350d-4a01-9d63-98461613a894', 'departamento', '10', 1),  -- HUANUCO
  ('00f81464-350d-4a01-9d63-98461613a894', 'departamento', '15', 1)   -- LIMA
ON CONFLICT (campaign_id, zone_level, zone_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ROCIO-PORRAS: provincia priority zones (padre_rocio.geojson)
--    5 provinces across the 3 departments
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO campaign_priority_zones (campaign_id, zone_level, zone_code, priority)
VALUES
  ('00f81464-350d-4a01-9d63-98461613a894', 'provincia', '0401', 1),  -- Arequipa/Arequipa
  ('00f81464-350d-4a01-9d63-98461613a894', 'provincia', '0405', 1),  -- Arequipa/Caylloma
  ('00f81464-350d-4a01-9d63-98461613a894', 'provincia', '1001', 1),  -- Huanuco/Huanuco
  ('00f81464-350d-4a01-9d63-98461613a894', 'provincia', '1002', 1),  -- Huanuco/Ambo
  ('00f81464-350d-4a01-9d63-98461613a894', 'provincia', '1501', 1)   -- Lima/Lima
ON CONFLICT (campaign_id, zone_level, zone_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ROCIO-PORRAS: distrito priority zones (hijo_rocio.geojson)
--    17 districts across the 5 provinces
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO campaign_priority_zones (campaign_id, zone_level, zone_code, priority)
VALUES
  -- Arequipa / Arequipa
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '040104', 1),
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '040117', 1),
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '040128', 1),
  -- Arequipa / Caylloma
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '040504', 1),
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '040505', 1),
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '040515', 1),
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '040519', 1),
  -- Huanuco / Huanuco
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '100101', 1),
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '100102', 1),
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '100107', 1),
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '100109', 1),
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '100111', 1),
  -- Huanuco / Ambo
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '100201', 1),
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '100204', 1),
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '100207', 1),
  -- Lima / Lima
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '150133', 1),
  ('00f81464-350d-4a01-9d63-98461613a894', 'distrito', '150143', 1)
ON CONFLICT (campaign_id, zone_level, zone_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify results
-- ─────────────────────────────────────────────────────────────────────────────

SELECT c.slug, cpz.zone_level, COUNT(*) as count
FROM campaign_priority_zones cpz
JOIN campaigns c ON c.id = cpz.campaign_id
GROUP BY c.slug, cpz.zone_level
ORDER BY c.slug, cpz.zone_level;

COMMIT;

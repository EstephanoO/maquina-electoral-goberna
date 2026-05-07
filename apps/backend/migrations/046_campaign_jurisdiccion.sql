-- 046: Add jurisdiction fields to campaigns
-- Stores the geographic scope of a campaign (departamento, provincia, or distrito)
-- so the map auto-centers on the relevant area.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS jurisdiccion_nivel TEXT
    CHECK (jurisdiccion_nivel IN ('departamento', 'provincia', 'distrito')),
  ADD COLUMN IF NOT EXISTS jurisdiccion_code  TEXT;

COMMENT ON COLUMN campaigns.jurisdiccion_nivel IS 'Admin level: departamento, provincia, or distrito';
COMMENT ON COLUMN campaigns.jurisdiccion_code  IS 'Code: CODDEP (2), CODDEP+CODPROV (4), or UBIGEO (6)';

-- 027_brigadista_telefono_index.sql
-- Expression index on data->>'telefono' for efficient brigadista metrics.
-- Supports query-time dedup via DISTINCT ON (data->>'telefono') and
-- the WHERE COALESCE(data->>'telefono','') != '' filter used by CMS.
--
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- Run this migration outside of BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fs_data_telefono
  ON form_submissions ((data->>'telefono'))
  WHERE COALESCE(data->>'telefono', '') != '';

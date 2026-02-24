-- 027_brigadista_telefono_index.sql
-- Expression index on data->>'telefono' for efficient brigadista metrics.
-- Supports query-time dedup via DISTINCT ON (data->>'telefono') and
-- the WHERE COALESCE(data->>'telefono','') != '' filter used by CMS.

CREATE INDEX IF NOT EXISTS idx_fs_data_telefono
  ON form_submissions ((data->>'telefono'))
  WHERE COALESCE(data->>'telefono', '') != '';

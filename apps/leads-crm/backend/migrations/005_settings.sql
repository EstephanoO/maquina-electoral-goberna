CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Global anti-ban defaults. Admins can tweak from the UI.
INSERT INTO settings (key, value)
VALUES ('antiban', jsonb_build_object(
  'max_per_day',            200,
  'min_delay_ms',           8000,
  'max_delay_ms',           20000,
  'burst_size',             12,
  'burst_rest_sec',         90,
  'window_start_hour',      8,
  'window_end_hour',        21,
  'circuit_fail_threshold', 5,
  'circuit_pause_sec',      60,
  'multipart_delay_min_ms', 2000,
  'multipart_delay_max_ms', 5000
))
ON CONFLICT (key) DO NOTHING;

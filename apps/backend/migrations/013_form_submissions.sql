-- Migration 013: Form Submissions
-- Adds: form_submissions table (dynamic JSONB), migrates legacy data

BEGIN;

-- ── 1. Create form_submissions table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_definition_id UUID REFERENCES form_definitions(id) ON DELETE SET NULL,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  meet_id UUID REFERENCES meets(id) ON DELETE SET NULL,
  meet_group_id UUID REFERENCES meet_groups(id) ON DELETE SET NULL,
  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  data JSONB NOT NULL DEFAULT '{}',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  client_id TEXT NOT NULL,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_form_submissions_client_id ON form_submissions(client_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_campaign ON form_submissions(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_meet ON form_submissions(meet_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_submitted_by ON form_submissions(submitted_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_definition ON form_submissions(form_definition_id);

-- ── 2. Migrate legacy forms data to form_submissions ──────────────────
INSERT INTO form_submissions (
  id, form_definition_id, campaign_id, meet_id, submitted_by, data, lat, lng, client_id, created_at
)
SELECT
  f.id,
  f.form_definition_id,
  f.campaign_id,
  f.meet_id,
  NULL,  -- submitted_by was not tracked in legacy
  jsonb_build_object(
    'nombre', f.nombre,
    'telefono', f.telefono,
    'zona', f.zona,
    'candidate', f.candidate,
    'encuestador', f.encuestador,
    'encuestador_id', f.encuestador_id,
    'candidato_preferido', f.candidato_preferido,
    'comentarios', f.comentarios,
    'home_maps_url', f.home_maps_url,
    'polling_place_url', f.polling_place_url
  ),
  f.x,
  f.y,
  f.client_id,
  f.created_at
FROM forms f
WHERE f.campaign_id IS NOT NULL
ON CONFLICT (client_id) DO NOTHING;

COMMIT;

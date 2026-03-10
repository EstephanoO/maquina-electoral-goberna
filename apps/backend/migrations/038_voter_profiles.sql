-- 038_voter_profiles.sql
-- Unified voter profile table: one row per person per campaign.
-- Dedup key: canonical_phone (last 9 digits, Peruvian mobile standard).
-- Merges data from form_submissions, form_validations, conversations,
-- and operator enrichment into a single trackable entity.

-- ── Helper function: normalize phone to 9-digit suffix ──
CREATE OR REPLACE FUNCTION normalize_phone_pe(raw TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Strip non-digits, take last 9 digits (Peruvian mobile standard)
  RETURN RIGHT(regexp_replace(COALESCE(raw, ''), '[^0-9]', '', 'g'), 9);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Main table ──
CREATE TABLE IF NOT EXISTS voter_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES campaigns(id),

  -- Identity (deduplicated)
  canonical_phone   TEXT NOT NULL,                        -- 9-digit normalized
  canonical_name    TEXT NOT NULL DEFAULT '',              -- best known name
  name_variants     TEXT[] NOT NULL DEFAULT '{}',          -- all observed spellings
  jids              TEXT[] NOT NULL DEFAULT '{}',          -- WhatsApp JIDs linked

  -- Geography
  departamento      TEXT NOT NULL DEFAULT '',
  provincia         TEXT NOT NULL DEFAULT '',
  distrito          TEXT NOT NULL DEFAULT '',
  zona              TEXT NOT NULL DEFAULT '',              -- free-text zone from field
  domicilio         TEXT NOT NULL DEFAULT '',              -- from operator notes
  local_votacion    TEXT NOT NULL DEFAULT '',              -- polling location
  last_lat          DOUBLE PRECISION,
  last_lng          DOUBLE PRECISION,

  -- Electoral intelligence
  vote_class        TEXT NOT NULL DEFAULT '',              -- duro / blando / flotante / invalido
  vote_class_source TEXT NOT NULL DEFAULT 'pending',       -- auto / manual / operator / pending
  confidence        REAL,
  category          TEXT NOT NULL DEFAULT '',              -- sector salud, coordinador, etc.
  signal_score      INT NOT NULL DEFAULT 0,
  signal_flags      JSONB NOT NULL DEFAULT '{}',

  -- Engagement pipeline
  pipeline_status   TEXT NOT NULL DEFAULT 'nuevo',         -- nuevo → contactado → respondido → comprometido → invalido
  first_captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_contacted_at TIMESTAMPTZ,
  last_responded_at TIMESTAMPTZ,
  wa_sent_count     INT NOT NULL DEFAULT 0,
  wa_received_count INT NOT NULL DEFAULT 0,

  -- Source tracking (arrays of linked IDs)
  source_submission_ids  UUID[] NOT NULL DEFAULT '{}',
  source_conversation_ids BIGINT[] NOT NULL DEFAULT '{}',
  source_validation_id   UUID,
  captured_by            UUID[] NOT NULL DEFAULT '{}',     -- brigadista user IDs
  contacted_by           UUID[] NOT NULL DEFAULT '{}',     -- operator user IDs

  -- Notes & tags
  tags              TEXT[] NOT NULL DEFAULT '{}',
  notes             TEXT NOT NULL DEFAULT '',
  operator_notes    JSONB NOT NULL DEFAULT '{}',

  -- Metadata
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Unique constraint: one profile per phone per campaign ──
CREATE UNIQUE INDEX IF NOT EXISTS idx_voter_profiles_phone_campaign
  ON voter_profiles (campaign_id, canonical_phone);

-- ── Query indexes ──
CREATE INDEX IF NOT EXISTS idx_voter_profiles_campaign_status
  ON voter_profiles (campaign_id, pipeline_status);

CREATE INDEX IF NOT EXISTS idx_voter_profiles_campaign_vote
  ON voter_profiles (campaign_id, vote_class)
  WHERE vote_class != '';

CREATE INDEX IF NOT EXISTS idx_voter_profiles_campaign_updated
  ON voter_profiles (campaign_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_voter_profiles_name_search
  ON voter_profiles USING gin (canonical_name gin_trgm_ops);

-- ── Seed from existing data ──
-- Populates voter_profiles from form_validations (already deduplicated per phone+campaign).
-- Uses COALESCE chain and normalize_phone_pe() to clean phone numbers.
-- ON CONFLICT skips if a profile for the same phone+campaign already exists.
INSERT INTO voter_profiles (
  campaign_id,
  canonical_phone,
  canonical_name,
  zona,
  vote_class,
  pipeline_status,
  first_captured_at,
  source_validation_id,
  tags,
  notes
)
SELECT
  fv.campaign_id,
  normalize_phone_pe(fv.telefono),
  fv.nombre,
  fv.zona,
  CASE WHEN fv.vote_class IN ('duro', 'blando', 'flotante', 'invalido') THEN fv.vote_class ELSE '' END,
  CASE fv.status
    WHEN 'pendiente'  THEN 'nuevo'
    WHEN 'contactado'  THEN 'contactado'
    WHEN 'respondido'  THEN 'respondido'
    WHEN 'invalido'    THEN 'invalido'
    ELSE 'nuevo'
  END,
  fv.created_at,
  fv.id,
  fv.tags,
  COALESCE(fv.notes, '')
FROM form_validations fv
WHERE normalize_phone_pe(fv.telefono) != ''
  AND LENGTH(normalize_phone_pe(fv.telefono)) = 9
  AND normalize_phone_pe(fv.telefono) != '987654321'
ON CONFLICT (campaign_id, canonical_phone) DO NOTHING;

-- ── Enrich with form_submissions data (GPS, operator notes, submission links) ──
-- This updates existing profiles with additional data from form_submissions.
WITH enrichment AS (
  SELECT DISTINCT ON (fs.campaign_id, normalize_phone_pe(COALESCE(fs.data->>'telefono', fs.data->>'Numero de Telefono', '')))
    fs.campaign_id,
    normalize_phone_pe(COALESCE(fs.data->>'telefono', fs.data->>'Numero de Telefono', '')) as canon_phone,
    fs.id as submission_id,
    fs.lat,
    fs.lng,
    COALESCE(fs.data->>'distrito', '') as distrito,
    fs.submitted_by,
    fs.cms_operator_notes,
    fs.cms_hablado_at,
    fs.cms_respondieron_at
  FROM form_submissions fs
  WHERE fs.deleted_at IS NULL
    AND LENGTH(normalize_phone_pe(COALESCE(fs.data->>'telefono', fs.data->>'Numero de Telefono', ''))) = 9
  ORDER BY fs.campaign_id, normalize_phone_pe(COALESCE(fs.data->>'telefono', fs.data->>'Numero de Telefono', '')), fs.created_at DESC
)
UPDATE voter_profiles vp
SET
  last_lat = COALESCE(e.lat, vp.last_lat),
  last_lng = COALESCE(e.lng, vp.last_lng),
  distrito = CASE WHEN vp.distrito = '' AND e.distrito != '' THEN e.distrito ELSE vp.distrito END,
  source_submission_ids = CASE WHEN e.submission_id = ANY(vp.source_submission_ids) THEN vp.source_submission_ids ELSE vp.source_submission_ids || e.submission_id END,
  domicilio = COALESCE(e.cms_operator_notes->>'domicilio', vp.domicilio),
  local_votacion = COALESCE(e.cms_operator_notes->>'local_votacion', vp.local_votacion),
  signal_score = COALESCE((e.cms_operator_notes->>'signal_score')::int, vp.signal_score),
  last_contacted_at = COALESCE(e.cms_hablado_at, vp.last_contacted_at),
  last_responded_at = COALESCE(e.cms_respondieron_at, vp.last_responded_at),
  captured_by = CASE WHEN e.submitted_by IS NULL OR e.submitted_by = ANY(vp.captured_by) THEN vp.captured_by ELSE vp.captured_by || e.submitted_by END,
  updated_at = now()
FROM enrichment e
WHERE vp.campaign_id = e.campaign_id
  AND vp.canonical_phone = e.canon_phone;

-- ── Link conversations (where phone is resolved) ──
UPDATE voter_profiles vp
SET
  jids = array_append(vp.jids, c.jid),
  wa_sent_count = vp.wa_sent_count + c.message_count - c.inbound_count,
  wa_received_count = vp.wa_received_count + c.inbound_count,
  source_conversation_ids = array_append(vp.source_conversation_ids, c.id),
  vote_class = CASE
    WHEN vp.vote_class = '' AND c.vote_class IS NOT NULL AND c.vote_class != '' THEN c.vote_class
    ELSE vp.vote_class
  END,
  vote_class_source = CASE
    WHEN vp.vote_class = '' AND c.vote_class IS NOT NULL AND c.vote_class != '' THEN c.classified_by
    ELSE vp.vote_class_source
  END,
  confidence = CASE
    WHEN vp.vote_class = '' AND c.confidence IS NOT NULL THEN c.confidence
    ELSE vp.confidence
  END,
  category = CASE
    WHEN vp.category = '' AND c.category IS NOT NULL AND c.category != '' THEN c.category
    ELSE vp.category
  END,
  updated_at = now()
FROM conversations c
WHERE c.campaign_id = vp.campaign_id
  AND c.phone IS NOT NULL
  AND normalize_phone_pe(c.phone) = vp.canonical_phone
  AND NOT (c.id = ANY(vp.source_conversation_ids));

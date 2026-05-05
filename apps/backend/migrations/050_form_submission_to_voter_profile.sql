-- 050: Auto-upsert voter_profile cuando se inserta un form_submission con teléfono.
--
-- Bug fixed: voterProfileRepo.upsert solo se llamaba desde conversations/routes.ts
-- (path WA). Form submissions (QR scan, mobile/web form) NO disparaban la creación
-- del voter_profile, así que el loop "lead QR → match con WA inbound" no funcionaba.
--
-- Este trigger fire AFTER INSERT en form_submissions, extrae phone+name+zona+distrito
-- del JSONB `data`, normaliza el phone a 9-digit Peru, y hace upsert en voter_profiles
-- en el conflict (campaign_id, canonical_phone). Sigue la misma forma que el upsert
-- en `voter-profiles/repository.ts:212` (mismo CASE para canonical_name, name_variants,
-- arrays de source_submission_ids/captured_by, last_lat/last_lng).

CREATE OR REPLACE FUNCTION upsert_voter_profile_from_form_submission()
RETURNS TRIGGER AS $$
DECLARE
  canon TEXT;
  raw_phone TEXT;
  raw_name TEXT;
  clean_name TEXT;
  raw_zona TEXT;
  raw_distrito TEXT;
BEGIN
  raw_phone := COALESCE(NEW.data->>'telefono', '');
  IF raw_phone = '' THEN
    RETURN NEW;
  END IF;

  canon := RIGHT(regexp_replace(raw_phone, '\D', '', 'g'), 9);
  -- Skip if phone not normalizable to 9 digits, or known sentinel "987654321"
  IF length(canon) <> 9 OR canon = '987654321' THEN
    RETURN NEW;
  END IF;

  raw_name := COALESCE(NEW.data->>'nombre', '');
  raw_zona := COALESCE(NEW.data->>'zona', '');
  raw_distrito := COALESCE(NEW.data->>'distrito', '');

  -- Loose junk-name filter (empty / single-char / digits-only). Mirrors isJunkName()
  -- in voter-profiles/repository.ts but without the regex blacklist (mami/bebe/etc.) —
  -- those edge cases get fixed manually by operators.
  clean_name := trim(raw_name);
  IF clean_name = '' OR clean_name ~ '^\d+$' OR length(clean_name) < 2 THEN
    clean_name := '';
  END IF;

  INSERT INTO voter_profiles (
    campaign_id, canonical_phone, canonical_name, zona, distrito,
    source_submission_ids, captured_by, last_lat, last_lng
  ) VALUES (
    NEW.campaign_id,
    canon,
    clean_name,
    raw_zona,
    raw_distrito,
    ARRAY[NEW.id],
    CASE WHEN NEW.submitted_by IS NOT NULL THEN ARRAY[NEW.submitted_by] ELSE '{}'::uuid[] END,
    NEW.lat,
    NEW.lng
  )
  ON CONFLICT (campaign_id, canonical_phone) DO UPDATE SET
    canonical_name = CASE
      WHEN EXCLUDED.canonical_name <> ''
       AND (voter_profiles.canonical_name = '' OR voter_profiles.canonical_name = voter_profiles.canonical_phone)
      THEN EXCLUDED.canonical_name
      ELSE voter_profiles.canonical_name
    END,
    name_variants = CASE
      WHEN EXCLUDED.canonical_name <> ''
       AND NOT (EXCLUDED.canonical_name = ANY(voter_profiles.name_variants))
      THEN voter_profiles.name_variants || EXCLUDED.canonical_name
      ELSE voter_profiles.name_variants
    END,
    zona = CASE
      WHEN voter_profiles.zona = '' AND EXCLUDED.zona <> ''
      THEN EXCLUDED.zona
      ELSE voter_profiles.zona
    END,
    distrito = CASE
      WHEN voter_profiles.distrito = '' AND EXCLUDED.distrito <> ''
      THEN EXCLUDED.distrito
      ELSE voter_profiles.distrito
    END,
    source_submission_ids = CASE
      WHEN NOT (NEW.id = ANY(voter_profiles.source_submission_ids))
      THEN voter_profiles.source_submission_ids || NEW.id
      ELSE voter_profiles.source_submission_ids
    END,
    captured_by = CASE
      WHEN NEW.submitted_by IS NOT NULL
       AND NOT (NEW.submitted_by = ANY(voter_profiles.captured_by))
      THEN voter_profiles.captured_by || NEW.submitted_by
      ELSE voter_profiles.captured_by
    END,
    last_lat = COALESCE(NEW.lat, voter_profiles.last_lat),
    last_lng = COALESCE(NEW.lng, voter_profiles.last_lng),
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_upsert_voter_profile_from_form_submission ON form_submissions;
CREATE TRIGGER trg_upsert_voter_profile_from_form_submission
  AFTER INSERT ON form_submissions
  FOR EACH ROW
  EXECUTE FUNCTION upsert_voter_profile_from_form_submission();

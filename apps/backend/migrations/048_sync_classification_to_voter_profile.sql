-- 048: Sync classification_events → voter_profiles.vote_class (Fase 0.B)
--
-- Bug being fixed: classification_events inserts (auto/manual) and corrections did NOT
-- propagate to voter_profiles.vote_class, so reports/dashboards stayed stale.
--
-- This trigger fires:
--   - AFTER INSERT  on classification_events (when vote_class is non-empty)
--   - AFTER UPDATE OF corrected_vote_class (when set to a non-null/non-empty value)
--
-- The voter_profiles row is matched on (campaign_id, canonical_phone) where
-- canonical_phone = last 9 digits of phone (Peru mobile normalization).
-- If no matching profile exists, the trigger is a no-op (does NOT block the insert).

CREATE OR REPLACE FUNCTION sync_classification_to_voter_profile()
RETURNS TRIGGER AS $$
DECLARE
  canon TEXT;
  effective_vote_class TEXT;
  effective_source TEXT;
  effective_category TEXT;
BEGIN
  -- Need a phone to locate the voter profile
  IF NEW.phone IS NULL OR length(NEW.phone) = 0 THEN
    RETURN NEW;
  END IF;

  -- Normalize: strip non-digits, take last 9 (Peru mobile)
  canon := RIGHT(regexp_replace(NEW.phone, '\D', '', 'g'), 9);
  IF length(canon) <> 9 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.vote_class IS NULL OR NEW.vote_class = '' THEN
      RETURN NEW;
    END IF;
    effective_vote_class := NEW.vote_class;
    effective_source := NEW.source;        -- 'auto' | 'manual' | 'correction'
    effective_category := NEW.category;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Fire only when corrected_vote_class transitions to a real value
    IF NEW.corrected_vote_class IS DISTINCT FROM OLD.corrected_vote_class
       AND NEW.corrected_vote_class IS NOT NULL
       AND NEW.corrected_vote_class <> '' THEN
      effective_vote_class := NEW.corrected_vote_class;
      effective_source := 'correction';
      effective_category := NEW.category;
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  UPDATE voter_profiles
     SET vote_class = effective_vote_class,
         vote_class_source = effective_source,
         category = CASE
                      WHEN COALESCE(effective_category, '') <> ''
                      THEN effective_category
                      ELSE category
                    END,
         updated_at = now()
   WHERE campaign_id = NEW.campaign_id
     AND canonical_phone = canon;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_classification_to_voter_profile_ins ON classification_events;
CREATE TRIGGER trg_sync_classification_to_voter_profile_ins
  AFTER INSERT ON classification_events
  FOR EACH ROW
  EXECUTE FUNCTION sync_classification_to_voter_profile();

DROP TRIGGER IF EXISTS trg_sync_classification_to_voter_profile_upd ON classification_events;
CREATE TRIGGER trg_sync_classification_to_voter_profile_upd
  AFTER UPDATE OF corrected_vote_class ON classification_events
  FOR EACH ROW
  EXECUTE FUNCTION sync_classification_to_voter_profile();

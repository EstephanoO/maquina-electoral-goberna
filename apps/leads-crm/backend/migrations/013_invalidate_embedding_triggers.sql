-- Sprint 1.4 (2026-05-07): triggers que invalidan embeddings stale.
--
-- Problema: cuando el operador edita un template (body) o una regla AI
-- (name/pattern) desde la UI admin, el embedding queda apuntando al texto
-- viejo. El cascade semantic sigue matcheando contra el embed obsoleto →
-- comportamiento confuso.
--
-- Fix: triggers BEFORE UPDATE que setean embedding=NULL cuando cambia el
-- texto canónico. El bot, al ver embedding IS NULL, simplemente no incluye
-- ese template/rule en el match semántico hasta que un backfill manual o
-- automático lo regenere.
--
-- Resilience: usa DO $$ … $$ con IF EXISTS para que si la columna `embedding`
-- no existe (DB local fresh, sin migrations 014+ aplicadas a mano), la
-- migration sea no-op en lugar de fallar.

DO $$
BEGIN
  -- ── templates: invalidar embedding cuando cambia body ──────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'templates' AND column_name = 'embedding'
  ) THEN
    CREATE OR REPLACE FUNCTION invalidate_template_embedding_on_body_change()
    RETURNS TRIGGER AS $fn$
    BEGIN
      IF NEW.body IS DISTINCT FROM OLD.body THEN
        NEW.embedding := NULL;
        NEW.embedding_text := NULL;
        NEW.embedded_at := NULL;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS tg_templates_invalidate_embedding ON templates;
    CREATE TRIGGER tg_templates_invalidate_embedding
      BEFORE UPDATE ON templates
      FOR EACH ROW
      EXECUTE FUNCTION invalidate_template_embedding_on_body_change();
  END IF;

  -- ── ai_rules: invalidar embedding cuando cambia name o pattern ─────
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_rules' AND column_name = 'embedding'
  ) THEN
    CREATE OR REPLACE FUNCTION invalidate_rule_embedding_on_change()
    RETURNS TRIGGER AS $fn$
    BEGIN
      IF NEW.name IS DISTINCT FROM OLD.name OR NEW.pattern IS DISTINCT FROM OLD.pattern THEN
        NEW.embedding := NULL;
        NEW.embedding_text := NULL;
        NEW.embedded_at := NULL;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS tg_ai_rules_invalidate_embedding ON ai_rules;
    CREATE TRIGGER tg_ai_rules_invalidate_embedding
      BEFORE UPDATE ON ai_rules
      FOR EACH ROW
      EXECUTE FUNCTION invalidate_rule_embedding_on_change();
  END IF;
END
$$;

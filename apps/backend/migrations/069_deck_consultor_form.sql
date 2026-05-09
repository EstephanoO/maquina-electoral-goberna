-- 069: Form del consultor + FK enforced en decks.candidato_id
--
-- 1) Sumamos columna `consultor_form` JSONB para los campos del
--    formulario opcional (biografía, costo/beneficio, redes,
--    denuncias, "quién es", etc). Cada sección del deck escribe acá.
-- 2) Forzamos la integridad referencial decks.candidato_id →
--    candidatos.candidato(id) ON DELETE CASCADE. Sin onboarding
--    completado (= sin row en candidatos.candidato), no se puede
--    crear deck.

-- 1) Form column
ALTER TABLE public.decks
  ADD COLUMN IF NOT EXISTS consultor_form JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_decks_consultor_form
  ON public.decks USING GIN (consultor_form);

-- 2) Verificar que no haya rows huérfanas antes de aplicar FK
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
    FROM public.decks d
    WHERE NOT EXISTS (
      SELECT 1 FROM candidatos.candidato c WHERE c.id = d.candidato_id
    );
  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'Migración 069 abortada: % decks con candidato_id huérfano. Limpiar manualmente antes de aplicar FK.',
      invalid_count;
  END IF;
END $$;

-- 3) FK enforcement (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fk_decks_candidato'
       AND conrelid = 'public.decks'::regclass
  ) THEN
    ALTER TABLE public.decks
      ADD CONSTRAINT fk_decks_candidato
        FOREIGN KEY (candidato_id) REFERENCES candidatos.candidato(id)
        ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON COLUMN public.decks.consultor_form IS
  'Form opcional del consultor — campos no derivables del onboarding (biografía, costo/beneficio, redes, denuncias, info Google, "quién es"). El backend lo usa al renderar el HTML del deck.';

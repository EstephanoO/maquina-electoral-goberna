-- 071: Snapshot inmutable del consultor_form al publicar
--
-- El admin route (consultor + admin) edita `consultor_form` libremente.
-- Cuando se publica, copiamos consultor_form → published_form. La vista
-- del candidato siempre lee de published_form — así los cambios post-
-- publicación NO se ven hasta que admin republique.

ALTER TABLE public.decks
  ADD COLUMN IF NOT EXISTS published_form JSONB;

CREATE INDEX IF NOT EXISTS idx_decks_published_form
  ON public.decks USING GIN (published_form)
  WHERE published_form IS NOT NULL;

COMMENT ON COLUMN public.decks.published_form IS
  'Snapshot inmutable del consultor_form al momento de publish. NULL hasta primera publicación. La vista candidato lee de acá; admin/consultor lee del consultor_form (working draft).';

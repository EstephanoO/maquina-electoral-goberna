-- 070: Status flow draft → pending_review → published
--
-- El consultor edita el deck localmente (status='draft'). Cuando lo
-- considera listo, lo manda a aprobación (status='pending_review') y
-- el admin proyecto@grupogoberna lo aprueba o rechaza.
--
-- Antes el flujo era directo draft → published (autopublish para
-- consultor_global_access). Ahora pasamos a un flujo con revisión
-- intermedia, manteniendo el autopublish opcional para casos urgentes.

-- 1) Permitir 'pending_review' como status válido
ALTER TABLE public.decks
  DROP CONSTRAINT IF EXISTS decks_status_check;

ALTER TABLE public.decks
  ADD CONSTRAINT decks_status_check
    CHECK (status IN ('draft', 'pending_review', 'published', 'rejected'));

-- 2) Timestamp del envío a revisión (para tracking SLA admin)
ALTER TABLE public.decks
  ADD COLUMN IF NOT EXISTS submitted_for_review_at TIMESTAMPTZ;

-- 3) Index para que el admin liste rápido los pending
CREATE INDEX IF NOT EXISTS idx_decks_pending_review
  ON public.decks (submitted_for_review_at DESC)
  WHERE status = 'pending_review';

COMMENT ON COLUMN public.decks.submitted_for_review_at IS
  'Cuando el consultor mandó este deck a aprobación. NULL si nunca pasó por pending_review.';

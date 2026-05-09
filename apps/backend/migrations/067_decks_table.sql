-- 067: Decks subidos por consultores
--
-- Cada consultor genera presentaciones HTML usando Claude Code + el kit
-- goberna-decks-consultor. El MCP server llama POST /api/consultor/decks
-- y este endpoint guarda el .html en /srv/uploads/decks/<uuid>.html y
-- crea una row con status='draft'. El admin revisa via /admin/decks y
-- decide publicarlo o rechazarlo.

CREATE TABLE IF NOT EXISTS public.decks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id          INTEGER NOT NULL,           -- FK manual: candidatos.candidato.id
  campaign_id           UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  uploaded_by_user_id   UUID NOT NULL REFERENCES public.users(id),
  reviewed_by_user_id   UUID REFERENCES public.users(id),

  title                 TEXT NOT NULL,
  type                  TEXT NOT NULL CHECK (type IN ('diagnostico', 'analisis', 'plan', 'episodico', 'otro')),
  description           TEXT,

  storage_path          TEXT NOT NULL,              -- /srv/uploads/decks/<uuid>.html
  size_bytes            INTEGER,

  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'rejected')),
  rejection_reason      TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_decks_candidato        ON public.decks (candidato_id);
CREATE INDEX IF NOT EXISTS idx_decks_status           ON public.decks (status);
CREATE INDEX IF NOT EXISTS idx_decks_uploaded_by      ON public.decks (uploaded_by_user_id);
CREATE INDEX IF NOT EXISTS idx_decks_status_candidato ON public.decks (status, candidato_id);

COMMENT ON TABLE public.decks IS
  'Presentaciones HTML generadas por consultores. status=draft hasta que admin las publica.';

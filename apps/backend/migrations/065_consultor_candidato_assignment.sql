-- 065: Asignación N:M entre consultores y candidatos
--
-- Habilita el flujo del MCP server: cada consultor solo ve los candidatos
-- que le fueron asignados explícitamente. Asignaciones las crea un admin.
--
-- Sin foreign key dura a candidatos.candidato (vive en otro schema y a veces
-- el id se reusa); validamos en el backend.

CREATE TABLE IF NOT EXISTS public.consultor_candidato (
  consultor_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  candidato_id      INTEGER NOT NULL,
  campaign_id       UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  assigned_by       UUID REFERENCES public.users(id),
  assigned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (consultor_user_id, candidato_id)
);

CREATE INDEX IF NOT EXISTS idx_consultor_candidato_consultor
  ON public.consultor_candidato (consultor_user_id);
CREATE INDEX IF NOT EXISTS idx_consultor_candidato_candidato
  ON public.consultor_candidato (candidato_id);

COMMENT ON TABLE  public.consultor_candidato IS
  'Asignación de candidatos a consultores políticos. Define qué candidatos puede ver cada consultor en /api/consultor/*';

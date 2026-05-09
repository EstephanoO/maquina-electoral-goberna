-- 066: Consultores con acceso global a todos los candidatos
--
-- Algunos consultores Goberna trabajan con TODA la cartera, no con
-- candidatos específicos. Esta tabla los marca para que el endpoint
-- /api/consultor/candidates les devuelva todos los candidatos
-- (presentes y futuros) sin necesidad de mantener filas en
-- consultor_candidato.

CREATE TABLE IF NOT EXISTS public.consultor_global_access (
  consultor_user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  granted_by        UUID REFERENCES public.users(id),
  granted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes             TEXT
);

COMMENT ON TABLE public.consultor_global_access IS
  'Consultores con acceso a TODOS los candidatos (incluso los que se registren después). Sino, ver consultor_candidato.';

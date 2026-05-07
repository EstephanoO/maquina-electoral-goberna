-- 058: Idempotency key sobre candidatos.postulacion para retries de
-- POST /api/onboarding/provisioned (nexus-control → electoral).
--
-- Nexus reintenta el step db_candidato si la primera llamada falla por
-- red. La unique parcial sobre nexus_tenant_id permite que el endpoint
-- detecte el retry y devuelva 200 con la postulacion existente en vez
-- de crear duplicados.

ALTER TABLE candidatos.postulacion
  ADD COLUMN IF NOT EXISTS nexus_tenant_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS postulacion_nexus_tenant_id_unique
  ON candidatos.postulacion (nexus_tenant_id)
  WHERE nexus_tenant_id IS NOT NULL;

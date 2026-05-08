-- 064: foto_url en candidatos.candidato para personalizar el deck Fase 2.
--
-- Se guarda como data URL (base64) o URL externa. TEXT sin tamaño máximo —
-- el límite real lo aplica el wizard (~500KB) antes de mandar el payload.
-- Nullable: candidatos pueden saltar el paso de foto en el onboarding.

ALTER TABLE candidatos.candidato
  ADD COLUMN IF NOT EXISTS foto_url TEXT;

COMMENT ON COLUMN candidatos.candidato.foto_url IS
  'URL o data URL de la foto del candidato. Renderiza en Fase 2 (slide Identity).';

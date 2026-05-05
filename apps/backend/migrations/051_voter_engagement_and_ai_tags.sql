-- 051: Engagement pipeline granular + AI auto-classification para voter_profiles.
--
-- Cambios:
--   1. Extiende los valores válidos de pipeline_status para soportar el ciclo
--      completo de fidelización pedido por producto:
--         pendiente_envio → comparte → no_responde / responde → fidelizado
--      Más los estados legacy (nuevo, contactado, respondido, comprometido,
--      invalido) que se mantienen para no romper datos existentes.
--   2. Agrega ai_classification jsonb con el output del módulo ai/ por perfil.
--   3. Agrega engagement_score y last_engagement_at para calcular el umbral
--      de "fidelizado" (default = 4 interacciones bidireccionales).
--   4. GIN index sobre tags para que el filtro ?tag= sea barato.
--
-- IMPORTANT: pipeline_status NO tiene CHECK constraint hoy, así que los valores
-- nuevos no requieren migración de datos. Los estados existentes siguen siendo
-- válidos.

ALTER TABLE voter_profiles
  ADD COLUMN IF NOT EXISTS ai_classification    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS engagement_score     INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_engagement_at   TIMESTAMPTZ;

-- Index sobre tags (text[]) para filtros por tag desde el CMS.
CREATE INDEX IF NOT EXISTS idx_voter_profiles_tags
  ON voter_profiles USING GIN (tags);

-- Index parcial para detectar rápido los pendientes de envío (mostrar lista en CMS).
CREATE INDEX IF NOT EXISTS idx_voter_profiles_pending_envio
  ON voter_profiles (campaign_id, last_engagement_at DESC)
  WHERE pipeline_status = 'pendiente_envio';

-- Index para el dashboard "fidelizados" (filtro común).
CREATE INDEX IF NOT EXISTS idx_voter_profiles_fidelizados
  ON voter_profiles (campaign_id, last_engagement_at DESC)
  WHERE pipeline_status = 'fidelizado';

COMMENT ON COLUMN voter_profiles.pipeline_status IS
  'nuevo | pendiente_envio | comparte | no_comparte | responde | no_responde | fidelizado | contactado | respondido | comprometido | invalido';

COMMENT ON COLUMN voter_profiles.ai_classification IS
  'JSON con {category, vote_class, confidence, reason, classified_at, model} del módulo ai/';

COMMENT ON COLUMN voter_profiles.engagement_score IS
  'Cuenta de interacciones bidireccionales (out + in) usada para detectar fidelizado. >= FIDELIZADO_THRESHOLD (default 4) ⇒ pipeline_status = fidelizado.';

-- ── form_qr_drafts: soporte para tokens "share-only" ────────────────
--
-- Hasta hoy, form_qr_drafts solo modela el flujo "brigadista llena form →
-- ciudadano escanea QR final → form submission persiste". El kind='share'
-- agrega un nuevo modo: tokens livianos sin form, sólo para el botón
-- "Compartir" del mobile, que generan un link bonito con OG completos
-- (/r/:token).
--
-- Diferencias de comportamiento:
--   kind='form'  → expires_at default 30 min (efímero, espera scan).
--                  /api/q/:token consume + persiste form_submission.
--   kind='share' → expires_at default 30 días (link compartible que dura).
--                  /api/q/:token NO consume nada (no hay form para inserstar).
--                  /api/r/:token siempre disponible mientras no expire.
ALTER TABLE form_qr_drafts
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'form';

-- Permite tokens 'share' con payload vacío sin que el código viejo se rompa.
-- (no hay constraint NOT NULL nuevo — el payload sigue siendo NOT NULL pero
-- '{}' es válido para el caso share).
COMMENT ON COLUMN form_qr_drafts.kind IS
  'form (default, flujo de scan + form submission, TTL 30min) | share (flujo de link compartible, TTL 30 días)';

CREATE INDEX IF NOT EXISTS idx_form_qr_drafts_brigadista_share
  ON form_qr_drafts(brigadista_id, campaign_id)
  WHERE kind = 'share' AND expires_at > NOW();

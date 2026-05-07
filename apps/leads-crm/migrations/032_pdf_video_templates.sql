-- 032_pdf_video_templates.sql
-- Soporte multimedia completo en templates: PDFs (brochures/temarios completos),
-- videos explicativos, audios. Importa los PDFs ya capturados de p4.

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS document_url      TEXT,
  ADD COLUMN IF NOT EXISTS document_filename TEXT,
  ADD COLUMN IF NOT EXISTS document_mime     TEXT,
  ADD COLUMN IF NOT EXISTS video_url         TEXT;

-- Import 2 PDFs detectados en historial p4 — ambos del bf59e33a tenant.
-- El primero (1.2MB) probablemente es el brochure principal, el segundo
-- (1MB) es un brochure secundario. Sin caption en el original, asumimos
-- que son temario PDF completos.

INSERT INTO templates
  (name, body, category, uses_count, media_kind, document_url, document_filename, document_mime)
VALUES
  ('brochure_pdf_1',
   E'Te comparto el brochure completo del programa 📄',
   'brochure', 1, 'document',
   'https://electoral.goberna.club/uploads/wa/bf59e33a-c15b-43e9-92ba-27035d99a211/dbb430319a885a8a52ec813c.pdf',
   'Brochure-Goberna-Escuela.pdf',
   'application/pdf'),

  ('brochure_pdf_2',
   E'Acá te comparto el brochure detallado 📄',
   'brochure', 1, 'document',
   'https://electoral.goberna.club/uploads/wa/bf59e33a-c15b-43e9-92ba-27035d99a211/d837a63c33335639d690e393.pdf',
   'Programa-Goberna.pdf',
   'application/pdf')
ON CONFLICT (name) DO UPDATE SET
  body = EXCLUDED.body,
  document_url = EXCLUDED.document_url,
  document_filename = EXCLUDED.document_filename,
  document_mime = EXCLUDED.document_mime,
  media_kind = EXCLUDED.media_kind,
  updated_at = now();

-- Reglas IA para detectar pedidos de brochure / temario completo / PDF
INSERT INTO ai_rules (name, pattern, tag, weight, enabled, source) VALUES
  ('intent:pide_brochure_pdf',
   '(?i)\b(brochure|folleto|pdf|temario\s*completo|programa\s*completo|s[ií]labo\s*completo|info\s*completa|enviame\s*el\s*pdf|m[aá]ndame.*pdf)\b',
   'intent:brochure_pdf', 1.0, TRUE, 'learned_p4_media'),

  ('intent:pide_video',
   '(?i)\b(video|mira(r)?\s*el\s*video|enviame\s*el\s*video|video\s*explicativo|tienen\s*video)\b',
   'intent:video', 0.9, TRUE, 'learned_p4_media')
ON CONFLICT DO NOTHING;

SELECT
  count(*) FILTER (WHERE media_kind = 'document') AS docs,
  count(*) FILTER (WHERE media_kind = 'video') AS videos,
  count(*) FILTER (WHERE media_kind = 'image') AS images,
  count(*) AS total
FROM templates;

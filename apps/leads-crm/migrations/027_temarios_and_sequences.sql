-- 027_temarios_and_sequences.sql
-- Hallazgos del análisis 2026-05-06 sobre el chat de Kathy con +51966662537 +
-- otros 100+ leads recientes:
--
-- Patrón observado: Kathy NO envía 1 mensaje, envía SECUENCIA:
--   1) saludo (text)
--   2) flyer del curso (image + caption rico)
--   3) TEMARIO (image — silabo del curso)
--   4) video explicativo
--   5) datos para registro (text)
--
-- Implementación: agregar templates de categoría 'temario' + 'video' y dejar
-- al picker decidir secuencias. La columna `sequence_after` (FK a otro
-- template) permite encadenar.

-- ── Add metadata columns to templates table ──────────────────────────
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS sequence_after INT REFERENCES templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_sku TEXT,           -- SKU del producto al que aplica este template
  ADD COLUMN IF NOT EXISTS media_kind TEXT;            -- text | image | video | document — para multi-media

CREATE INDEX IF NOT EXISTS idx_templates_product_sku ON templates(product_sku) WHERE product_sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_templates_sequence_after ON templates(sequence_after) WHERE sequence_after IS NOT NULL;

-- ── Insert 3 TEMARIO templates con sus URLs reales ──────────────────
INSERT INTO templates (name, body, category, image_url, uses_count, product_sku, media_kind)
VALUES
  ('temario_gestion_parlamentaria',
   E'TEMARIO',
   'temario',
   'https://electoral.goberna.club/uploads/wa/bf59e33a-c15b-43e9-92ba-27035d99a211/0a649899232fee5a6147fef9.jpg',
   10,
   'GEN5C2G1',
   'image'),

  ('temario_ia_marketing',
   E'TEMARIO',
   'temario',
   'https://electoral.goberna.club/uploads/wa/bf59e33a-c15b-43e9-92ba-27035d99a211/e4ddcfdd8e9ebd0121598356.jpg',
   6,
   'DIPIAMP006',
   'temario'),

  ('temario_director_comunicaciones',
   E'TEMARIO',
   'temario',
   'https://electoral.goberna.club/uploads/wa/bf59e33a-c15b-43e9-92ba-27035d99a211/7e425d1d2b52de02843bed6e.jpg',
   1,
   'DIPDC150',
   'image')
ON CONFLICT (name) DO UPDATE SET
  image_url = EXCLUDED.image_url, product_sku = EXCLUDED.product_sku,
  category = EXCLUDED.category, media_kind = EXCLUDED.media_kind, updated_at = now();


-- ── Mark existing flyer templates with their product_sku ────────────
UPDATE templates SET product_sku = 'GEN5C2G1', media_kind = 'image'
 WHERE category = 'flyer' AND lower(body) LIKE '%parlamentari%' AND product_sku IS NULL;
UPDATE templates SET product_sku = 'DIPIAMP006', media_kind = 'image'
 WHERE category = 'flyer' AND lower(body) LIKE '%ia y marketing%' AND product_sku IS NULL;
UPDATE templates SET product_sku = 'DIPDC150', media_kind = 'image'
 WHERE category = 'flyer' AND lower(body) LIKE '%director%comunicaci%' AND product_sku IS NULL;
UPDATE templates SET product_sku = 'CONSULTOR-POL-2026', media_kind = 'image'
 WHERE category = 'flyer' AND lower(body) LIKE '%consultor%pol%' AND product_sku IS NULL;
UPDATE templates SET product_sku = 'LIDERAZGO-POL-2026', media_kind = 'image'
 WHERE category = 'flyer' AND lower(body) LIKE '%liderazgo%' AND product_sku IS NULL;

-- Defaults para templates sin media kind explícito
UPDATE templates SET media_kind = 'text' WHERE media_kind IS NULL;


-- ── Stats ────────────────────────────────────────────────────────────
SELECT category, count(*), count(*) FILTER (WHERE image_url IS NOT NULL) AS con_imagen
FROM templates GROUP BY category ORDER BY count DESC;

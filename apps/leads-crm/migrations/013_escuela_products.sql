-- 013_escuela_products.sql
-- Catálogo editable de productos/cursos de Escuela. Source of truth para el
-- auto-reply futuro. Vive en leads-crm para evitar cross-DB queries.
--
-- Diferencia con `escuela.products` que está en electoral DB:
--   - electoral.escuela.products tiene los 50 productos importados del .sql
--     (libros, pines, packs, cursos), source histórico
--   - leads-crm.escuela_products tiene SÓLO los cursos editables que arman
--     el flyer activo (~6 al mes), con todos los campos para auto-reply
--
-- Cada producto puede tener una `ai_rule` asociada (auto-clasificación
-- regex → tag). Cuando el operador edita el producto, la rule se actualiza.

CREATE TABLE IF NOT EXISTS escuela_products (
  id                 SERIAL PRIMARY KEY,
  sku                TEXT,                              -- ej. GEN5C2G1, opcional
  nombre             TEXT NOT NULL,
  descripcion        TEXT NOT NULL DEFAULT '',
  imagen_url         TEXT,                              -- URL del flyer
  precio_soles       NUMERIC(10,2),                     -- precio Perú
  precio_dolares     NUMERIC(10,2),                     -- precio internacional
  fecha_inicio       DATE,
  fecha_fin          DATE,
  dias_semana        TEXT,                              -- "Martes y Jueves"
  horario            TEXT,                              -- "7:00pm - 9:00pm (hora Perú)"
  horas_academicas   TEXT,                              -- "200 HORAS" / "120 HORAS"
  modalidad          TEXT NOT NULL DEFAULT 'zoom',      -- zoom | presencial | mixto | autoestudio
  link_matricula     TEXT,                              -- URL para inscripción directa
  cuenta_bancaria    TEXT,                              -- texto multilinea con BCP/Interbank/Yape
  yape_numero        TEXT,                              -- ej. "944531711"

  -- Auto-classifier: si pattern está seteado, una ai_rule se mantiene en sync
  -- con este producto. ai_rule_id apunta a ai_rules.id (FK lazy — si la rule
  -- se borra, el producto queda sin bind y se puede re-crear).
  classifier_pattern TEXT,                              -- regex que detecta el producto
  classifier_tag     TEXT,                              -- tag a aplicar, ej. "interés:gestion-parlamentaria"
  ai_rule_id         INT REFERENCES ai_rules(id) ON DELETE SET NULL,

  -- featured = true para los del flyer activo. enabled = visible en UI.
  featured           BOOLEAN NOT NULL DEFAULT FALSE,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,

  created_by         TEXT,
  updated_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escuela_products_featured ON escuela_products(featured) WHERE featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_escuela_products_inicio   ON escuela_products(fecha_inicio) WHERE fecha_inicio IS NOT NULL;

-- Seed inicial: los 6 cursos del flyer "Próximos Inicios" mostrado por el user.
-- precio en USD aprox según .sql, fechas del flyer.
INSERT INTO escuela_products
  (sku, nombre, descripcion, precio_soles, precio_dolares, fecha_inicio, dias_semana, horario, horas_academicas, modalidad, classifier_pattern, classifier_tag, featured, created_by)
VALUES
  ('DIPJEOPA002', 'Operaciones de Inteligencia y Engaño Estratégico',
   'Curso de especialización para profesionales de seguridad y defensa. Técnicas de operaciones encubiertas, contrainteligencia, deception planning.',
   500, 150,
   '2026-05-12', 'Martes y Jueves', '7:00 p.m. a 9:00 p.m. (hora Perú)', '120 HORAS', 'zoom',
   '(?i)operaciones.*intelig|enga[ñn]o.*estrat|deception',
   'interés:operaciones-inteligencia', TRUE, 'system_seed'),

  ('DIPOSOC004', 'OSINT & SOCMINT',
   'Diploma técnico en Open Source Intelligence y Social Media Intelligence. Curso para investigadores, analistas y profesionales de seguridad.',
   450, 135,
   '2026-05-18', 'Lunes', '7:00 p.m. a 9:00 p.m. (hora Perú)', '120 HORAS', 'zoom',
   '(?i)\bosint\b|\bsocmint\b|open\s*source\s*intelligence',
   'interés:osint-socmint', TRUE, 'system_seed'),

  ('DIPIAMP006', 'IA y Marketing Político',
   'Diploma Internacional en Inteligencia Artificial aplicada a estrategias de Marketing Político y Comunicación Electoral.',
   450, 135,
   '2026-05-18', 'Lunes', '7:00 p.m. a 9:00 p.m. (hora Perú)', '120 HORAS', 'zoom',
   '(?i)(\bia\b|inteligencia\s*artificial).*marketing|marketing\s*pol[ií]tic.*ia|ia\s*y\s*mkt',
   'interés:ia-marketing-politico', TRUE, 'system_seed'),

  ('DIPTEEI003', 'Analista de Inteligencia',
   'Diploma Élite "Técnicas Analíticas Estructuradas en Inteligencia". Para analistas de inteligencia, oficiales militares y profesionales de seguridad.',
   650, 199,
   '2026-05-25', 'Lunes', '7:00 p.m. a 9:00 p.m. (hora Perú)', '200 HORAS', 'zoom',
   '(?i)analista\s*de\s*intelig|t[eé]cnicas\s*anal[ií]ticas',
   'interés:analista-inteligencia', TRUE, 'system_seed'),

  ('GEN5C2G1', 'Gestión Parlamentaria Bicameral',
   'Diploma Técnico en Gestión Parlamentaria Bicameral. Para senadores, diputados y equipo parlamentario. Domina el proceso legislativo bicameral del Congreso 2026.',
   650, 199,
   '2026-06-02', 'Martes y Jueves', '7:00 p.m. a 9:00 p.m. (hora Perú)', '200 HORAS', 'zoom',
   '(?i)gesti[oó]n\s*parlamentari|parlamentari[ao]\s*bicameral|t[eé]cnico\s*de\s*gesti[oó]n\s*parlam|diploma.*parlamentari',
   'interés:gestion-parlamentaria', TRUE, 'system_seed'),

  ('EPCOOIP017', 'Oratoria e Imagen Política',
   'Curso de Especialización en Oratoria e Imagen Política. Domina la comunicación pública, oratoria, debate y construcción de imagen política.',
   650, 199,
   '2026-06-05', 'Viernes', '7:00 p.m. a 9:00 p.m. (hora Perú)', '120 HORAS', 'zoom',
   '(?i)oratoria.*imagen|imagen\s*pol[ií]tic|curso.*oratoria|oratoria.*pol[ií]tic',
   'interés:oratoria-imagen-politica', TRUE, 'system_seed')
ON CONFLICT DO NOTHING;

-- Cuenta bancaria default (compartida entre los 6 productos del flyer actual).
-- Cuando el operador edita un producto puede sobreescribir esto, pero seedeamos
-- con el formato standard que la operadora Kathy usa en los chats reales.
UPDATE escuela_products SET
  cuenta_bancaria = E'🏫 *ESCUELA ACADEMICA GOBERNA EIRL*\n*RUC:* 20608310925\n\n🏦 *BCP*\n*Cuenta:* 1939936368051\n*CCI:* 00219300993636805115\n\n🏦 *INTERBANK*\n*Cuenta:* 2003004813730\n*CCI:* 00320000300481373038',
  yape_numero     = '944531711'
WHERE featured = TRUE AND cuenta_bancaria IS NULL;

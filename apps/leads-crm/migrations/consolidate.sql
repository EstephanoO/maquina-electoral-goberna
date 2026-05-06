-- Consolidación: escuela.lead_360 (electoral, exportado a CSV) → leads-crm.leads
-- Carga el dump en una temp table, hace UPDATE de leads matched, INSERT del resto.

DROP TABLE IF EXISTS tmp_escuela_clients;
CREATE TEMP TABLE tmp_escuela_clients (
  canonical_phone     TEXT,
  client_id           BIGINT,
  codigo_cliente      TEXT,
  nombre              TEXT,
  dni                 TEXT,
  ocupacion           TEXT,
  fecha_nac           TEXT,
  email               TEXT,
  sales_count         INT,
  sales_total         NUMERIC,
  last_purchase_at    TEXT,
  enrollments_count   INT,
  last_enrolled_course TEXT,
  certificates_count  INT,
  buyer_tier          TEXT
);

\COPY tmp_escuela_clients FROM '/tmp/lead_360.csv' WITH CSV HEADER;

SELECT count(*) AS loaded FROM tmp_escuela_clients;

-- UPDATE leads existentes (match por last 9 dígitos)
WITH matched AS (
  SELECT DISTINCT ON (l.id)
    l.id AS lead_id,
    t.*
  FROM leads l
  JOIN tmp_escuela_clients t
    ON regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g') ILIKE '%' || RIGHT(t.canonical_phone, 9)
  ORDER BY l.id, t.client_id
)
UPDATE leads l SET
  name              = CASE
                        WHEN l.name IS NULL OR l.name = '' OR l.name = l.phone
                          OR l.name ~ '^\+?\d+$'
                        THEN m.nombre
                        ELSE l.name
                      END,
  dni               = COALESCE(NULLIF(l.dni, ''), NULLIF(m.dni, '')),
  ocupacion         = COALESCE(NULLIF(l.ocupacion, ''), NULLIF(m.ocupacion, '')),
  fecha_nacimiento  = COALESCE(l.fecha_nacimiento, NULLIF(m.fecha_nac, '')::date),
  email             = COALESCE(NULLIF(l.email, ''), NULLIF(m.email, '')),
  country           = COALESCE(NULLIF(l.country, ''), CASE
                        WHEN m.canonical_phone LIKE '593%' THEN 'Ecuador'
                        WHEN m.canonical_phone LIKE '591%' THEN 'Bolivia'
                        WHEN m.canonical_phone LIKE '595%' THEN 'Paraguay'
                        WHEN m.canonical_phone LIKE '598%' THEN 'Uruguay'
                        WHEN m.canonical_phone LIKE '52%'  THEN 'México'
                        WHEN m.canonical_phone LIKE '57%'  THEN 'Colombia'
                        WHEN m.canonical_phone LIKE '56%'  THEN 'Chile'
                        WHEN m.canonical_phone LIKE '54%'  THEN 'Argentina'
                        WHEN m.canonical_phone LIKE '58%'  THEN 'Venezuela'
                        WHEN m.canonical_phone LIKE '34%'  THEN 'España'
                        WHEN m.canonical_phone LIKE '51%'  THEN 'Perú'
                        ELSE NULL
                      END),
  buyer_tier        = m.buyer_tier,
  total_usd_spent   = m.sales_total,
  n_purchases       = m.sales_count,
  last_purchase_year = COALESCE(EXTRACT(YEAR FROM NULLIF(m.last_purchase_at, '')::timestamptz)::int, l.last_purchase_year),
  first_purchase_at = COALESCE(l.first_purchase_at, NULLIF(m.last_purchase_at, '')::timestamptz),
  last_course       = COALESCE(NULLIF(l.last_course, ''), NULLIF(m.last_enrolled_course, '')),
  enrollments_count = m.enrollments_count,
  certificates_count = m.certificates_count,
  escuela_client_id = m.client_id,
  stage             = CASE
                        WHEN l.stage IN ('new', 'contacted') THEN
                          CASE m.buyer_tier
                            WHEN 'vip'     THEN 'resold'
                            WHEN 'repeat'  THEN 'resold'
                            WHEN 'single'  THEN 'delivered'
                            WHEN 'prospect' THEN 'interested'
                            ELSE l.stage
                          END
                        ELSE l.stage
                      END,
  updated_at        = now()
FROM matched m
WHERE l.id = m.lead_id;

SELECT count(*) AS leads_actualizados FROM leads WHERE escuela_client_id IS NOT NULL;

-- INSERT clientes que no matchearon como leads
INSERT INTO leads (
  name, phone, country, source, stage, priority,
  email, dni, ocupacion, fecha_nacimiento,
  buyer_tier, total_usd_spent, n_purchases, last_purchase_year, first_purchase_at,
  last_course, enrollments_count, certificates_count, escuela_client_id
)
SELECT
  COALESCE(NULLIF(t.nombre, ''), t.codigo_cliente, '+' || t.canonical_phone),
  '+' || t.canonical_phone,
  CASE
    WHEN t.canonical_phone LIKE '593%' THEN 'Ecuador'
    WHEN t.canonical_phone LIKE '591%' THEN 'Bolivia'
    WHEN t.canonical_phone LIKE '595%' THEN 'Paraguay'
    WHEN t.canonical_phone LIKE '598%' THEN 'Uruguay'
    WHEN t.canonical_phone LIKE '52%'  THEN 'México'
    WHEN t.canonical_phone LIKE '57%'  THEN 'Colombia'
    WHEN t.canonical_phone LIKE '56%'  THEN 'Chile'
    WHEN t.canonical_phone LIKE '54%'  THEN 'Argentina'
    WHEN t.canonical_phone LIKE '58%'  THEN 'Venezuela'
    WHEN t.canonical_phone LIKE '34%'  THEN 'España'
    WHEN t.canonical_phone LIKE '51%'  THEN 'Perú'
    ELSE NULL
  END,
  'escuela_erp',
  CASE t.buyer_tier
    WHEN 'vip'    THEN 'resold'
    WHEN 'repeat' THEN 'resold'
    WHEN 'single' THEN 'delivered'
    ELSE 'interested'
  END,
  'medium',
  NULLIF(t.email, ''),
  NULLIF(t.dni, ''),
  NULLIF(t.ocupacion, ''),
  NULLIF(t.fecha_nac, '')::date,
  t.buyer_tier,
  t.sales_total,
  t.sales_count,
  EXTRACT(YEAR FROM NULLIF(t.last_purchase_at, '')::timestamptz)::int,
  NULLIF(t.last_purchase_at, '')::timestamptz,
  NULLIF(t.last_enrolled_course, ''),
  t.enrollments_count,
  t.certificates_count,
  t.client_id
FROM tmp_escuela_clients t
WHERE NOT EXISTS (
  SELECT 1 FROM leads l
   WHERE regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g') ILIKE '%' || RIGHT(t.canonical_phone, 9)
);

-- Stats finales
SELECT
  count(*)                                                  AS total,
  count(*) FILTER (WHERE escuela_client_id IS NOT NULL)     AS con_erp_link,
  count(*) FILTER (WHERE buyer_tier = 'vip')                AS vip,
  count(*) FILTER (WHERE buyer_tier = 'repeat')             AS repeat_buyers,
  count(*) FILTER (WHERE buyer_tier = 'single')             AS single_buyers,
  count(*) FILTER (WHERE source = 'escuela_erp')            AS desde_erp,
  count(*) FILTER (WHERE dni IS NOT NULL AND dni <> '')     AS con_dni,
  count(*) FILTER (WHERE ocupacion IS NOT NULL AND ocupacion <> '')  AS con_ocupacion,
  round(sum(total_usd_spent)::numeric, 0)                   AS revenue_total
FROM leads;

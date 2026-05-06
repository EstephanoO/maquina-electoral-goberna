-- Re-load the temp table (it's per-session, so we need to re-COPY)
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

-- INSERT con DISTINCT ON para evitar dups intra-CSV + ON CONFLICT por las
-- conflict_targets del index funcional sobre regexp_replace(phone)
INSERT INTO leads (
  name, phone, country, source, stage, priority,
  email, dni, ocupacion, fecha_nacimiento,
  buyer_tier, total_usd_spent, n_purchases, last_purchase_year, first_purchase_at,
  last_course, enrollments_count, certificates_count, escuela_client_id
)
SELECT DISTINCT ON (RIGHT(t.canonical_phone, 9))
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
   WHERE regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g') = RIGHT(t.canonical_phone, 9)
      OR regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g') = t.canonical_phone
)
ORDER BY RIGHT(t.canonical_phone, 9), t.client_id
ON CONFLICT DO NOTHING;

-- Stats finales
SELECT
  count(*)                                                  AS total,
  count(*) FILTER (WHERE escuela_client_id IS NOT NULL)     AS con_erp_link,
  count(*) FILTER (WHERE buyer_tier = 'vip')                AS vip,
  count(*) FILTER (WHERE buyer_tier = 'repeat')             AS repeat_buyers,
  count(*) FILTER (WHERE buyer_tier = 'single')             AS single_buyers,
  count(*) FILTER (WHERE source = 'escuela_erp')            AS desde_erp,
  count(*) FILTER (WHERE dni IS NOT NULL AND dni <> '')     AS con_dni,
  count(*) FILTER (WHERE ocupacion IS NOT NULL AND ocupacion <> '') AS con_ocupacion,
  count(*) FILTER (WHERE last_course IS NOT NULL AND last_course <> '') AS con_ultimo_curso,
  round(sum(total_usd_spent)::numeric, 0)                   AS revenue_total
FROM leads;

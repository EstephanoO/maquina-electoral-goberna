CREATE TABLE IF NOT EXISTS escuela.monedas (
  id INT PRIMARY KEY,
  codigo VARCHAR(3) NOT NULL,
  rate_to_usd NUMERIC(10,6) NOT NULL
);
INSERT INTO escuela.monedas (id, codigo, rate_to_usd) VALUES
  (1, 'USD', 1.000000),
  (2, 'PEN', 0.290000),
  (3, 'BOB', 0.150000),
  (4, 'COP', 0.000230),
  (5, 'MXN', 0.058000),
  (6, 'CLP', 0.001100),
  (7, 'DOP', 0.016000)
ON CONFLICT (id) DO UPDATE SET codigo = EXCLUDED.codigo, rate_to_usd = EXCLUDED.rate_to_usd;

SELECT count(*) AS sales,
       round(sum(s.monto_total * m.rate_to_usd)::numeric, 0) AS revenue_usd_real,
       round(sum(s.monto_total)::numeric, 0) AS sum_inflado
FROM escuela.sales s
LEFT JOIN escuela.monedas m ON m.id = s.moneda_id;

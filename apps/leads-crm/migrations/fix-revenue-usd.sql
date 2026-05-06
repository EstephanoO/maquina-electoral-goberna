DROP TABLE IF EXISTS tmp_client_usd;
CREATE TEMP TABLE tmp_client_usd (escuela_client_id BIGINT PRIMARY KEY, total_usd_real NUMERIC(12,2));
\COPY tmp_client_usd FROM '/tmp/client_usd.csv' WITH CSV DELIMITER ',';

UPDATE leads l
   SET total_usd_spent = t.total_usd_real,
       updated_at = now()
  FROM tmp_client_usd t
 WHERE l.escuela_client_id = t.escuela_client_id
   AND l.id = (SELECT MIN(id) FROM leads WHERE escuela_client_id = t.escuela_client_id);

-- For leads that NO eran del ERP (crm_import, whatsapp), también deflatamos.
-- El crm_import probablemente vino con valores en PEN. Conservadora: aplicar 0.29.
UPDATE leads
   SET total_usd_spent = ROUND(total_usd_spent * 0.29, 2)
 WHERE source = 'crm_import'
   AND total_usd_spent > 1000;  -- solo los que parecen estar en PEN/CLP/COP

SELECT
  source,
  count(*) AS leads,
  count(*) FILTER (WHERE total_usd_spent > 0) AS con_compras,
  round(sum(total_usd_spent)::numeric, 0) AS revenue_usd,
  round(avg(total_usd_spent) FILTER (WHERE total_usd_spent > 0)::numeric, 0) AS avg
FROM leads
GROUP BY source
ORDER BY revenue_usd DESC NULLS LAST;

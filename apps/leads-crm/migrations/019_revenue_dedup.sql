-- 019_revenue_dedup.sql
-- Fix revenue inflation: cuando se consolidaron 5,165 leads con escuela_client_id,
-- varios leads quedaron mapeados al mismo client_id (mismo phone en formatos
-- distintos). Cada lead heredó total_usd_spent del mismo cliente → SUM
-- contó la misma compra varias veces.
--
-- Solución: solo el lead con id mínimo por escuela_client_id conserva
-- total_usd_spent y n_purchases. Los demás se ponen en 0.

UPDATE leads
   SET total_usd_spent = 0,
       n_purchases = 0
 WHERE escuela_client_id IS NOT NULL
   AND id NOT IN (
     SELECT MIN(id)
       FROM leads
      WHERE escuela_client_id IS NOT NULL
      GROUP BY escuela_client_id
   );

SELECT
  count(*) AS total,
  count(*) FILTER (WHERE total_usd_spent > 0) AS con_compras,
  round(sum(total_usd_spent)::numeric, 0) AS revenue_total
FROM leads;

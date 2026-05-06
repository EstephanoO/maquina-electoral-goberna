-- 034_country_backfill.sql
-- Detect country from phone prefix using comprehensive table.
-- México móvil usa +521 (el "1" agregado por WhatsApp para móviles), pero
-- mi detección anterior solo veía "52" → caía en None. Mismo issue para
-- Argentina con +549 (móvil), Brasil con +55, etc.

-- Reference: https://en.wikipedia.org/wiki/List_of_country_calling_codes
-- + WhatsApp mobile prefixes

CREATE OR REPLACE FUNCTION detect_country_from_phone(phone TEXT) RETURNS TEXT AS $$
DECLARE
  d TEXT;
BEGIN
  IF phone IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(phone, '\D', '', 'g');
  IF length(d) < 8 THEN RETURN NULL; END IF;

  -- Caribbean (Republica Dominicana usa +1-809, +1-829, +1-849)
  IF substr(d, 1, 4) IN ('1809','1829','1849') THEN RETURN 'República Dominicana'; END IF;
  IF substr(d, 1, 4) = '1787' OR substr(d, 1, 4) = '1939' THEN RETURN 'Puerto Rico'; END IF;

  -- México móvil/fijo: +52 o +521
  IF substr(d, 1, 3) = '521' THEN RETURN 'México'; END IF;
  IF substr(d, 1, 2) = '52'  THEN RETURN 'México'; END IF;

  -- Argentina móvil: +549, fijo +54
  IF substr(d, 1, 3) = '549' THEN RETURN 'Argentina'; END IF;
  IF substr(d, 1, 2) = '54'  THEN RETURN 'Argentina'; END IF;

  -- Brasil móvil: +55 (siempre, con o sin el 9 mobile prefix por estado)
  IF substr(d, 1, 2) = '55'  THEN RETURN 'Brasil'; END IF;

  -- Colombia móvil/fijo: +57 (móviles empiezan con 3)
  IF substr(d, 1, 2) = '57'  THEN RETURN 'Colombia'; END IF;

  -- Países con código de 3 dígitos (LATAM)
  IF substr(d, 1, 3) = '593' THEN RETURN 'Ecuador'; END IF;
  IF substr(d, 1, 3) = '591' THEN RETURN 'Bolivia'; END IF;
  IF substr(d, 1, 3) = '595' THEN RETURN 'Paraguay'; END IF;
  IF substr(d, 1, 3) = '598' THEN RETURN 'Uruguay'; END IF;
  IF substr(d, 1, 3) = '506' THEN RETURN 'Costa Rica'; END IF;
  IF substr(d, 1, 3) = '502' THEN RETURN 'Guatemala'; END IF;
  IF substr(d, 1, 3) = '503' THEN RETURN 'El Salvador'; END IF;
  IF substr(d, 1, 3) = '504' THEN RETURN 'Honduras'; END IF;
  IF substr(d, 1, 3) = '505' THEN RETURN 'Nicaragua'; END IF;
  IF substr(d, 1, 3) = '507' THEN RETURN 'Panamá'; END IF;

  -- Resto LATAM
  IF substr(d, 1, 2) = '51'  THEN RETURN 'Perú'; END IF;
  IF substr(d, 1, 2) = '56'  THEN RETURN 'Chile'; END IF;
  IF substr(d, 1, 2) = '58'  THEN RETURN 'Venezuela'; END IF;
  IF substr(d, 1, 2) = '53'  THEN RETURN 'Cuba'; END IF;

  -- Europa
  IF substr(d, 1, 2) = '34'  THEN RETURN 'España'; END IF;
  IF substr(d, 1, 2) = '33'  THEN RETURN 'Francia'; END IF;
  IF substr(d, 1, 2) = '49'  THEN RETURN 'Alemania'; END IF;
  IF substr(d, 1, 2) = '39'  THEN RETURN 'Italia'; END IF;
  IF substr(d, 1, 2) = '44'  THEN RETURN 'Reino Unido'; END IF;

  -- USA / Canadá (default si empieza con 1 y no es Caribe)
  IF substr(d, 1, 1) = '1'   THEN RETURN 'EEUU/Canadá'; END IF;

  -- Otros frecuentes
  IF substr(d, 1, 2) = '63'  THEN RETURN 'Filipinas'; END IF;
  IF substr(d, 1, 2) = '60'  THEN RETURN 'Malasia'; END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Backfill leads sin country
UPDATE leads
   SET country = detect_country_from_phone(phone),
       updated_at = now()
 WHERE phone IS NOT NULL
   AND (country IS NULL OR country = '' OR country = 'Unknown')
   AND detect_country_from_phone(phone) IS NOT NULL;

-- Stats post-backfill
SELECT
  count(*) AS total_leads,
  count(*) FILTER (WHERE country IS NOT NULL AND country != '' AND country != 'Unknown') AS con_pais,
  count(*) FILTER (WHERE country IS NULL OR country = '' OR country = 'Unknown') AS sin_pais
FROM leads WHERE phone IS NOT NULL;

-- 002_fix_postulacion_jurisdiccion_pais.sql
--
-- El check chk_postulacion_jurisdiccion_present de la migration 001
-- exige al menos UNA jurisdicción (departamento/provincia/distrito) en
-- toda postulación. Eso falla para cargos de ámbito nacional como
-- Presidente / Senador Nacional / Parlamento Andino, donde la
-- jurisdicción correcta es "país" y no tenemos columna id_pais.
--
-- Fix: aflojamos el check para permitir las 3 NULLs cuando el cargo
-- es de ámbito 'nacion' (según fase_1.cargo_gobierno joineado con
-- geografia_politica.jurisdiccion).
--
-- Implementación: drop el check viejo + agregar uno que use subquery
-- correlacionada con cargo_gobierno + jurisdiccion para conocer el ámbito.

ALTER TABLE candidatos.postulacion
  DROP CONSTRAINT IF EXISTS chk_postulacion_jurisdiccion_present;

-- Función helper: dado un id_cargo, devuelve el tipo de jurisdicción
-- ('nacion' / 'departamento' / 'provincia' / 'distrito') asociado al cargo.
CREATE OR REPLACE FUNCTION candidatos._cargo_ambito(p_id_cargo INTEGER)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT j.tipo
    FROM fase_1.cargo_gobierno c
    JOIN geografia_politica.jurisdiccion j ON j.id = c.id_jurisdiccion
   WHERE c.id = p_id_cargo
   LIMIT 1
$$;

-- Nuevo check: ámbito nacion permite todo NULL; resto exige la
-- jurisdicción correspondiente.
ALTER TABLE candidatos.postulacion
  ADD CONSTRAINT chk_postulacion_jurisdiccion_coherente
  CHECK (
    -- Si no hay cargo todavía (postulación creada en draft), permitir.
    id_cargo_gobierno IS NULL
    OR (
      CASE candidatos._cargo_ambito(id_cargo_gobierno)
        WHEN 'nacion'       THEN TRUE
        WHEN 'departamento' THEN id_departamento IS NOT NULL
        WHEN 'provincia'    THEN id_provincia    IS NOT NULL
        WHEN 'distrito'     THEN id_distrito     IS NOT NULL
        ELSE id_departamento IS NOT NULL OR id_provincia IS NOT NULL OR id_distrito IS NOT NULL
      END
    )
  );

COMMENT ON CONSTRAINT chk_postulacion_jurisdiccion_coherente
  ON candidatos.postulacion IS
  'La jurisdicción requerida depende del ámbito del cargo: nacion=ninguna, '
  'departamento=id_departamento, provincia=id_provincia, distrito=id_distrito.';

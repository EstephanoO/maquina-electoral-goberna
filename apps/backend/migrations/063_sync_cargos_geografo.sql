-- 063_sync_cargos_geografo.sql
--
-- Sincroniza catalogos.nivel_gobierno + catalogos.cargo_gobierno con el
-- catálogo curado por el geógrafo en la DB onboarding_fase1 (schema fase_1).
--
-- Cambios:
--  1) nivel_gobierno: re-codifica de nacional/regional/local a
--     PRESIDENCIAL/PARLAMENTARIO/GOBIERNO_LOCAL (los que el wizard
--     onboarding consume — ver step `level`).
--  2) cargo_gobierno: trunca y repuebla con los 8 cargos curados
--     (Presidente, Senador Nacional, Senador Regional, Diputado,
--      Parlamento Andino, Gobernador Regional, Alcalde Provincial,
--      Alcalde Distrital).
--
-- Pendiente (no incluido — geógrafo todavía no agregó):
--   Vicepresidente, Vicegobernador Regional, Consejero Regional, Regidor.
--
-- Idempotente (ON CONFLICT en codigos + UPDATE de nombres en nivel).
-- Seguro porque candidatos.postulacion no tiene rows aún.

-- ── 1) nivel_gobierno: alinear codes con el wizard ─────────────────────
UPDATE catalogos.nivel_gobierno SET codigo='PRESIDENCIAL',   nombre='Presidencia'    WHERE id=1;
UPDATE catalogos.nivel_gobierno SET codigo='PARLAMENTARIO',  nombre='Parlamento'     WHERE id=2;
UPDATE catalogos.nivel_gobierno SET codigo='GOBIERNO_LOCAL', nombre='Gobierno Local' WHERE id=3;

-- ── 2) cargo_gobierno: reseed completo ─────────────────────────────────
-- DELETE en lugar de TRUNCATE: postulacion tiene FK pero 0 rows.
-- TRUNCATE bloquea por el constraint aunque la tabla referida esté vacía.
DELETE FROM catalogos.cargo_gobierno;
ALTER SEQUENCE catalogos.cargo_gobierno_id_seq RESTART WITH 1;

INSERT INTO catalogos.cargo_gobierno (codigo, nombre, ambito_geografico, id_nivel_gobierno) VALUES
  ('presidente',           'Presidente',           'pais',         1),
  ('senador_nacional',     'Senador Nacional',     'pais',         2),
  ('senador_regional',     'Senador Regional',     'departamento', 2),
  ('diputado',             'Diputado',             'departamento', 2),
  ('parlamento_andino',    'Parlamento Andino',    'pais',         2),
  ('gobernador_regional',  'Gobernador Regional',  'departamento', 3),
  ('alcalde_provincial',   'Alcalde Provincial',   'provincia',    3),
  ('alcalde_distrital',    'Alcalde Distrital',    'distrito',     3);

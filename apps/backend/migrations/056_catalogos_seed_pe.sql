-- 056: Seed de catálogos para Perú.
-- 1 país, 2 roles, 3 niveles, 10 cargos PE con ambito_geografico.
-- Idempotente vía ON CONFLICT DO NOTHING en cada natural key.
--
-- TODO: poblar catalogos.organizacion_politica con los 16 partidos PE
-- canónicos. Por ahora se deja vacío y el endpoint acepta
-- id_organizacion_politica nullable. Cuando se carguen, nexus puede
-- mapear el partido text → id antes de invocar /api/onboarding/provisioned.

INSERT INTO catalogos.pais (iso2, iso3, nombre) VALUES
  ('PE', 'PER', 'Perú')
ON CONFLICT (iso2) DO NOTHING;

INSERT INTO catalogos.rol_campana (codigo, nombre) VALUES
  ('candidato', 'Candidato'),
  ('estratega', 'Estratega')
ON CONFLICT (codigo) DO NOTHING;

WITH pe AS (SELECT id FROM catalogos.pais WHERE iso2 = 'PE')
INSERT INTO catalogos.nivel_gobierno (id_pais, codigo, nombre)
SELECT pe.id, x.codigo, x.nombre
FROM pe, (VALUES
  ('nacional', 'Nacional'),
  ('regional', 'Regional'),
  ('local',    'Local')
) AS x(codigo, nombre)
ON CONFLICT (id_pais, codigo) DO NOTHING;

WITH niveles AS (
  SELECT ng.id, ng.codigo
  FROM catalogos.nivel_gobierno ng
  JOIN catalogos.pais p ON p.id = ng.id_pais
  WHERE p.iso2 = 'PE'
)
INSERT INTO catalogos.cargo_gobierno (id_nivel_gobierno, codigo, nombre, ambito_geografico)
SELECT n.id, c.codigo, c.nombre, c.ambito
FROM (VALUES
  -- nacional (4)
  ('nacional', 'presidente',             'Presidente',                'pais'),
  ('nacional', 'vicepresidente',         'Vicepresidente',            'pais'),
  ('nacional', 'congresista',            'Congresista',               'departamento'),
  ('nacional', 'parlamentario_andino',   'Parlamentario Andino',      'pais'),
  -- regional (3)
  ('regional', 'gobernador_regional',    'Gobernador Regional',       'departamento'),
  ('regional', 'vicegobernador_regional','Vicegobernador Regional',   'departamento'),
  ('regional', 'consejero_regional',     'Consejero Regional',        'provincia'),
  -- local (3)
  ('local',    'alcalde_provincial',     'Alcalde Provincial',        'provincia'),
  ('local',    'alcalde_distrital',      'Alcalde Distrital',         'distrito'),
  ('local',    'regidor',                'Regidor',                   'distrito')
) AS c(nivel_codigo, codigo, nombre, ambito)
JOIN niveles n ON n.codigo = c.nivel_codigo
ON CONFLICT (id_nivel_gobierno, codigo) DO NOTHING;

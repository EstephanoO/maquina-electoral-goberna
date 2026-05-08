-- 062_seed_organizacion_politica_pe.sql
--
-- Seed catalogos.organizacion_politica con los 16 partidos PE canónicos
-- inscritos en el JNE como "partidos políticos" (registro al 2026-05).
-- Cubre el TODO que quedó en migration 056 ("poblar
-- catalogos.organizacion_politica con los 16 partidos PE canónicos").
--
-- Why ahora: el wizard SetupFlow le pide al candidato elegir partido, y
-- nexus-control mapea esa selección al `organizacion_politica_codigo` que
-- consume /api/onboarding/provisioned. Sin seed, el endpoint rechaza con
-- CATALOG_NOT_FOUND.
--
-- Source: registro JNE (https://infogob.jne.gob.pe). El "codigo" interno
-- es snake_case derivado del nombre oficial (no es código JNE numérico —
-- esos cambian). Los siglas son los oficiales del partido.
--
-- Idempotente vía ON CONFLICT (id_pais, codigo).

INSERT INTO catalogos.organizacion_politica (id_pais, codigo, nombre, siglas)
SELECT p.id, v.codigo, v.nombre, v.siglas
FROM catalogos.pais p
CROSS JOIN (VALUES
  ('accion_popular',                'Acción Popular',                                'AP'),
  ('alianza_para_el_progreso',      'Alianza para el Progreso',                     'APP'),
  ('avanza_pais',                   'Avanza País — Partido de Integración Social',  'AVP'),
  ('democracia_directa',            'Democracia Directa',                           'DD'),
  ('el_frente_amplio',              'Frente Amplio por Justicia, Vida y Libertad',  'FA'),
  ('frepap',                        'Frente Popular Agrícola FIA del Perú',         'FREPAP'),
  ('fuerza_popular',                'Fuerza Popular',                               'FP'),
  ('juntos_por_el_peru',            'Juntos por el Perú',                           'JP'),
  ('partido_aprista_peruano',       'Partido Aprista Peruano',                      'PAP'),
  ('partido_morado',                'Partido Morado',                               'PM'),
  ('partido_nacionalista_peruano',  'Partido Nacionalista Peruano',                 'PNP'),
  ('partido_popular_cristiano',     'Partido Popular Cristiano',                    'PPC'),
  ('peru_libre',                    'Perú Libre',                                   'PL'),
  ('podemos_peru',                  'Podemos Perú',                                 'PP'),
  ('renovacion_popular',            'Renovación Popular',                           'RP'),
  ('somos_peru',                    'Somos Perú',                                   'SP')
) AS v(codigo, nombre, siglas)
WHERE p.iso2 = 'PE'
ON CONFLICT (id_pais, codigo) DO UPDATE
   SET nombre = EXCLUDED.nombre,
       siglas = EXCLUDED.siglas;

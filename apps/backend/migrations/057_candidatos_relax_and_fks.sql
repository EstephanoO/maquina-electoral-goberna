-- 057: Relax NOT NULL on candidatos.candidato + add FKs to catalogos.*
--
-- - El wizard SetupFlow (Modern Animated Onboarding-3) no pide DNI ni
--   separa apellidos. Hasta que el candidato complete su perfil tras el
--   primer login con Firebase, dejamos esos campos NULL. Las columnas
--   originales eran NOT NULL en prod pero las tablas estaban vacías
--   (0 rows), así que el DROP NOT NULL es seguro.
--
-- - candidatos.* fue creado por el geógrafo apuntando a catalogos.* y
--   geografia_politica.*. Migration 055/056 ya creó catalogos.* — ahora
--   formalizamos los FKs que estaban implícitos. geografia_politica.*
--   queda fuera de este PR (otro repo del geógrafo).

-- ── Relax NOT NULL en candidato.* ──────────────────────────────────
ALTER TABLE candidatos.candidato ALTER COLUMN apellidos        DROP NOT NULL;
ALTER TABLE candidatos.candidato ALTER COLUMN documento_numero DROP NOT NULL;

-- ── FKs candidatos.* → catalogos.* (idempotentes) ─────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidato_id_pais_fkey') THEN
    ALTER TABLE candidatos.candidato
      ADD CONSTRAINT candidato_id_pais_fkey
      FOREIGN KEY (id_pais) REFERENCES catalogos.pais(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postulacion_id_rol_campana_fkey') THEN
    ALTER TABLE candidatos.postulacion
      ADD CONSTRAINT postulacion_id_rol_campana_fkey
      FOREIGN KEY (id_rol_campana) REFERENCES catalogos.rol_campana(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postulacion_id_cargo_gobierno_fkey') THEN
    ALTER TABLE candidatos.postulacion
      ADD CONSTRAINT postulacion_id_cargo_gobierno_fkey
      FOREIGN KEY (id_cargo_gobierno) REFERENCES catalogos.cargo_gobierno(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postulacion_id_organizacion_politica_fkey') THEN
    ALTER TABLE candidatos.postulacion
      ADD CONSTRAINT postulacion_id_organizacion_politica_fkey
      FOREIGN KEY (id_organizacion_politica) REFERENCES catalogos.organizacion_politica(id) ON DELETE RESTRICT;
  END IF;

  -- candidatos.postulacion.campaign_id ya tiene tipo UUID pero no FK formal
  -- a public.campaigns en prod. La agregamos.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postulacion_campaign_id_fkey') THEN
    ALTER TABLE candidatos.postulacion
      ADD CONSTRAINT postulacion_campaign_id_fkey
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
  END IF;
END $$;

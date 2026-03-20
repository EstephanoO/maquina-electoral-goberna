-- 045_blast_blocklist.sql
-- Tabla global de números bloqueados para TODOS los celulares de blast.
-- Un contacto aquí = excluido de todas las campañas, sin importar el número.

CREATE TABLE IF NOT EXISTS blast_blocklist (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_digits  text        NOT NULL UNIQUE,
  source        text        DEFAULT 'csv',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blast_blocklist_phone
ON blast_blocklist(phone_digits);

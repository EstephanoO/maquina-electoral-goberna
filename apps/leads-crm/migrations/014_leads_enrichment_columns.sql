-- 014_leads_enrichment_columns.sql
-- Agrega columnas que vienen del ERP de Escuela (cliente, no lead).
-- Permiten guardar DNI, ocupación, fecha de nacimiento + flags de origen
-- al consolidar el catálogo histórico hacia leads-crm.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS dni                 VARCHAR(30),
  ADD COLUMN IF NOT EXISTS ocupacion           TEXT,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento    DATE,
  -- ID del cliente original en el ERP (tb_cliente.id_cliente). Permite
  -- saber si este lead es resultado de la consolidación + auditar duplicados.
  ADD COLUMN IF NOT EXISTS escuela_client_id   BIGINT,
  -- Último curso matriculado (snapshot — el lead puede tener varios)
  ADD COLUMN IF NOT EXISTS last_course         TEXT,
  -- Conteo + total de matrículas (no es lo mismo que n_purchases — un lead
  -- puede comprar 3 cursos o 1 curso 3 veces para alguien)
  ADD COLUMN IF NOT EXISTS enrollments_count   INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS certificates_count  INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leads_dni
  ON leads(dni) WHERE dni IS NOT NULL AND dni <> '';
CREATE INDEX IF NOT EXISTS idx_leads_escuela_client_id
  ON leads(escuela_client_id) WHERE escuela_client_id IS NOT NULL;

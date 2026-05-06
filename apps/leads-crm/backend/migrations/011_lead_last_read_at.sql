-- 011_lead_last_read_at.sql
-- Mark-as-read tracking. Hasta hoy, leads.unread_count se calculaba como
-- "mensajes_in posteriores al último message_out", lo que significaba que
-- abrir un chat nunca bajaba el contador — solo bajaba si el operador
-- *respondía*. Para los chats donde el operador lee pero no contesta, el
-- badge se quedaba inflado para siempre.
--
-- Esta migration agrega `last_read_at` y los queries del endpoint /chats
-- pasan a calcular unread como "mensajes_in posteriores a max(last_read_at,
-- last message_out)". Cuando el frontend marca como leído, hace POST
-- /chats/:id/read que actualiza este campo a now().

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

-- Index para que el cálculo de unread_count sea barato en /chats query.
CREATE INDEX IF NOT EXISTS idx_leads_last_read_at
  ON leads(last_read_at)
  WHERE last_read_at IS NOT NULL;

-- 053: Seed de la campaña sandbox "Pruebas WSP" + wa_phone para 51944531711.
--
-- Esta campaña existe SOLO como destino de tráfico de prueba del bot —
-- el número 51944531711 que el bot conectará empuja sus eventos a wa-events
-- y, gracias al lookup por wa_phones (own_number → campaign_id), terminan
-- atribuidos a esta campaña sandbox.
--
-- No tiene candidato real, no tiene team, no afecta a producción real.
-- Borrarla con: DELETE FROM campaigns WHERE slug = 'pruebas-wsp';
-- (cascade limpia wa_phones, conversations, voter_profiles, etc.)
--
-- Idempotente: ON CONFLICT (slug) DO NOTHING — re-correr la migration
-- sobre una DB que ya tiene la campaña no hace nada.

INSERT INTO campaigns (name, slug, status, config)
VALUES (
  'Pruebas WSP',
  'pruebas-wsp',
  'active',
  jsonb_build_object(
    'whatsapp_number',     '51944531711',
    'whatsapp_qr_message', 'Hola, escribo desde el sandbox de Goberna (testing).',
    'color_primario',      '#163960',
    'color_secundario',    '#FFC800',
    'is_sandbox',          true
  )
)
ON CONFLICT (slug) DO NOTHING;

-- Registrar el número como wa_phone vinculado a esta campaña. Es el lookup
-- que hace el bot via GET /api/cms/active-wa-phones para saber a qué campaign
-- atribuir los eventos.
INSERT INTO wa_phones (campaign_id, number, alias)
SELECT id, '51944531711', 'Pruebas Reconocimiento'
FROM campaigns
WHERE slug = 'pruebas-wsp'
ON CONFLICT (campaign_id, number) DO NOTHING;

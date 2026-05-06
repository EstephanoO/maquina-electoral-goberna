-- 029_holding_responses.sql
-- Cuando el bot no encuentra template/regla, en vez de quedarse callado o
-- decir "te derivo con un humano" (que rompe la ilusión de ser Kathy),
-- envía un mensaje "holding": natural, humano, comprando tiempo. El lead
-- piensa que la asesora está revisando. En paralelo se marca al lead con
-- needs_human_attention=TRUE para que el operador real lo atienda.

INSERT INTO templates (name, body, category, uses_count, media_kind) VALUES
  ('holding_revisar',
   E'Déjame revisar esa información y te confirmo en un momento ✨',
   'holding', 0, 'text'),

  ('holding_verificando',
   E'Permíteme verificarlo y te respondo en breve 🙂',
   'holding', 0, 'text'),

  ('holding_consultar',
   E'Voy a consultar esto con el equipo y te confirmo enseguida 👋',
   'holding', 0, 'text'),

  ('holding_minutos',
   E'Dame unos minutos por favor, estoy con varias consultas y ya te respondo 🙏',
   'holding', 0, 'text'),

  ('holding_anotando',
   E'Anoto tu consulta y te respondo en breve, gracias por escribirnos 😊',
   'holding', 0, 'text')
ON CONFLICT (name) DO UPDATE SET body = EXCLUDED.body, updated_at = now();

SELECT count(*) FROM templates WHERE category = 'holding';

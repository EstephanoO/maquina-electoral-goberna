-- Crea un consultor con acceso global a TODOS los candidatos (presentes y futuros).
-- Uso (en VPS):
--   docker exec -i goberna_postgres_appdb psql -U postgres -d appdb < scripts/create-consultor-global.sql
--
-- Ajustá los valores antes de correr — email, full_name, phone, GRANTED_BY (admin user_id).

-- 1) Crear el user (password_hash NULL — login por OTP/Firebase opcional).
--    Si ya existe el email, el INSERT falla y el script aborta. Borrá el row antes
--    o cambiá el email.
WITH new_consultor AS (
  INSERT INTO public.users (
    email,
    password_hash,
    full_name,
    phone,
    role,
    status
  ) VALUES (
    'consultor@grupogoberna.com',          -- ← ajustar
    NULL,                                   -- sin password (login via OTP o solo MCP token)
    'Consultor Global Goberna',             -- ← ajustar
    NULL,                                   -- phone opcional
    'consultor',
    'active'
  )
  RETURNING id, email, full_name
),
admin_user AS (
  SELECT id FROM public.users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1
)
-- 2) Otorgar acceso global (presentes + futuros candidatos).
INSERT INTO public.consultor_global_access (consultor_user_id, granted_by, notes)
SELECT
  nc.id,
  au.id,
  'Consultor global creado vía script — ve TODOS los candidatos presentes y futuros.'
FROM new_consultor nc
CROSS JOIN admin_user au
RETURNING consultor_user_id, granted_at;

-- 3) Mostrar el user creado para que el admin emita el token MCP.
SELECT
  u.id   AS user_id,
  u.email,
  u.full_name,
  u.role,
  EXISTS (
    SELECT 1 FROM public.consultor_global_access cga
     WHERE cga.consultor_user_id = u.id
  ) AS has_global_access
FROM public.users u
WHERE u.email = 'consultor@grupogoberna.com';   -- ← ajustar si cambiaste el email arriba

-- ── Próximo paso ───────────────────────────────────────────────────────
-- Una vez creado, abrir https://electoral.goberna.club/consultores como admin,
-- click en el consultor → "Generar token", copiar y mandárselo al consultor.
-- El consultor lo guarda en ~/.config/goberna/token y el MCP lo usa.

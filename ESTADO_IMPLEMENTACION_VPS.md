# Estado implementacion VPS

Fecha: 2026-02-14

## Objetivo ejecutado

Se dejo una base de infraestructura operable en VPS para backend, manteniendo frontend temporal en Vercel.

- Frontend temporal: `https://maquina-electoral-goberna-web.vercel.app`
- VPS backend: `161.132.39.165`
- Usuario operativo: `deploy`
- Ruta proyecto en VPS: `/srv/app`

## Lo que ya quedo hecho

### 1) Bootstrap del VPS

Instalado y habilitado:

- Docker (`docker.io`)
- Docker Compose v2 (`docker compose`)
- Git
- UFW
- fail2ban
- Certbot

Notas:

- Nginx del host se deshabilito para evitar conflicto de puertos con Nginx en contenedor.
- El Nginx activo para la app es el del `docker-compose.yml`.

### 2) Seguridad base

- UFW activo con reglas minimas:
  - `22/tcp` (OpenSSH)
  - `80/tcp`
  - `443/tcp`
- fail2ban activo con jail `sshd` habilitado.

### 3) Estructura operativa

Directorios preparados:

- `/srv/app`
- `/srv/backups`
- `/srv/app/certbot/www`
- `/srv/app/certbot/conf`
- `/srv/app/nginx/certs`

### 4) Repo y acceso Git en VPS

- Repo clonado limpio en `/srv/app`.
- Deploy key del VPS agregada en GitHub (read-only) para permitir `git fetch/pull` desde el VPS.
- `git status -sb` en VPS queda limpio sobre `main...origin/main`.

### 5) Variables de entorno productivas

- Archivo generado: `/srv/app/.env`
- Incluye secretos largos para:
  - `JWT_SECRET`
  - `POSTGRES_PASSWORD`
  - `REDIS_PASSWORD`
- Permisos aplicados: `chmod 600 /srv/app/.env`

### 6) Stack levantado

Se ejecuto:

```bash
cd /srv/app
docker compose up -d --build --remove-orphans
```

Servicios arriba:

- `postgres` (healthy)
- `redis` (healthy)
- `tegola`
- `backend`
- `nginx`

### 7) Validaciones realizadas

- Health endpoint por IP temporal:

```bash
curl http://161.132.39.165/health
```

Resultado: HTTP `200` con `ok: true`.

- Backup ejecutado:

```bash
cd /srv/app
./scripts/backup.sh
```

- Restore smoke test ejecutado:

```bash
cd /srv/app
./scripts/restore-smoke-test.sh
```

Resultado: restore OK.

### 8) Backup automatico

Cron configurado:

```cron
0 3 * * * cd /srv/app && ./scripts/backup.sh >> /var/log/app-backup.log 2>&1
```

### 9) CI/CD (GitHub Actions)

Secrets configurados en el repo:

- `VPS_HOST=161.132.39.165`
- `VPS_PORT=22`
- `SSH_PRIVATE_KEY`

Workflow objetivo: deploy por push a `main` via SSH al VPS.

## Estado actual

- Infra base funcional y operable.
- Deploy por contenedores funcionando en VPS.
- Backups diarios listos.
- Falta fase de dominio propio para cerrar HTTPS productivo final.

## Pendiente para fase dominio propio

Cuando se defina dominio real:

1. Crear `api.<dominio>` en Cloudflare apuntando al VPS (proxy ON).
2. Cambiar `API_DOMAIN` en `/srv/app/.env`.
3. Activar SSL productivo (Certbot o Cloudflare Origin Certificate).
4. En Vercel, setear `NEXT_PUBLIC_MAP_API_BASE=https://api.<dominio>`.
5. Validar `https://api.<dominio>/health` en `200`.

Referencia extendida:

- `docs/BOOTSTRAP_SUDO_Y_MIGRACION_DOMINIO.md`

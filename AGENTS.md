# AGENTS.md - Source of Truth (Infra de Produccion)

## 1) Objetivo de hoy (mandatory)

Dejar una base de infraestructura **estable y operable** para produccion en VPS de 32GB con:

- Frontend en Vercel
- Cloudflare delante
- Backend monolito en contenedores
- CI/CD basico de deploy
- Backups de DB automaticos
- Logging basico

Resultado esperado hoy:

- Docker en produccion funcionando
- Deploy automatico a `main`
- Backup diario de PostgreSQL con retencion
- Reverse proxy con Nginx + SSL
- Infra simple para mantener por 2 devs

---

## 2) Contexto del proyecto

- Equipo: `2 devs`
- Infra target: `1 VPS (32GB)`
- Frontend hosting: `Vercel`
- DNS/Edge: `Cloudflare (proxy ON)`
- Backend: `Monolito`
- Prioridad actual: `operabilidad > sofisticacion`

---

## 3) Parametros obligatorios (rellenar antes de ejecutar)

Reemplazar estos valores en scripts y configs:

- `APP_NAME=<app_name>`
- `VPS_HOST=<ip_o_hostname_vps>`
- `DEPLOY_USER=deploy`
- `PROJECT_DIR=/srv/app`
- `API_DOMAIN=api.<dominio>`
- `TZ=<timezone>`
- `POSTGRES_DB=<db_name>`
- `POSTGRES_USER=<db_user>`
- `POSTGRES_PASSWORD=<db_password_largo>`
- `JWT_SECRET=<jwt_secret_largo>`
- `BACKUP_DIR=/srv/backups`
- `BACKUP_RETENTION_DAYS=7`
- `BACKEND_PORT=3000`

GitHub Secrets requeridos:

- `VPS_HOST`
- `SSH_PRIVATE_KEY`

Opcional recomendado:

- `VPS_PORT` (si SSH no usa 22)

---

## 4) Arquitectura objetivo (actual)

### Runtime

- `postgres:15` con volumen persistente
- `redis:7`
- `backend` (build local desde `./backend`)
- `nginx` como reverse proxy publico

### Flujo de trafico

`Cliente -> Cloudflare -> Nginx (VPS) -> Backend`

### Flujo de deploy

`push main -> GitHub Actions -> SSH VPS -> docker compose up -d --build`

---

## 5) Reglas operativas

1. Nunca subir `.env` a git.
2. No exponer PostgreSQL ni Redis a internet.
3. Toda app se levanta por `docker compose` en `PROJECT_DIR`.
4. Cualquier cambio de infra debe mantener deploy reproducible por script.
5. Si falla deploy, rollback inmediato al ultimo estado estable.

---

## 6) Runbook de implementacion

## 6.1 Hardening base del VPS

1. Crear usuario seguro y permisos sudo.
2. Deshabilitar `root` por SSH y autenticacion por password.
3. Configurar firewall (`OpenSSH`, `80`, `443`).
4. Instalar dependencias base: Docker, Compose, Git, Nginx, Certbot.
5. Habilitar Docker al boot.

## 6.2 Estructura de carpetas

Ruta base:

`/srv/app`

Contenido minimo:

- `docker-compose.yml`
- `.env`
- `backend/`
- `nginx/`

## 6.3 Docker Compose de produccion

Servicios minimos:

- `postgres`
- `redis`
- `backend`
- `nginx`

Notas:

- Corregir typo en Redis: usar `container_name` (no `containe r_name`).
- Mantener `restart: always`.
- Definir red interna dedicada (`app_network`).
- Persistir datos de PostgreSQL con volumen (`pgdata`).

## 6.4 Variables de entorno

Definir en `.env`:

- credenciales DB
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`

Politica:

- secretos largos
- rotacion trimestral recomendada

## 6.5 Deploy inicial manual

Desde `PROJECT_DIR`:

- build + up en detached
- validar estado de contenedores

## 6.6 CI/CD basico

Archivo:

- `.github/workflows/deploy.yml`

Evento:

- push a `main`

Flujo remoto:

1. `git pull`
2. `docker compose down`
3. `docker compose up -d --build`

## 6.7 Backups automaticos DB

Script:

- `/srv/backup.sh`

Frecuencia:

- diario 03:00

Retencion:

- `BACKUP_RETENTION_DAYS` (default 7)

Validacion minima:

- generar al menos un backup de prueba
- verificar restauracion en entorno de prueba

## 6.8 Logging basico

Minimo hoy:

- logs por contenedor (`docker logs`)
- backend con logs estructurados (ej. winston)
- request logs HTTP (ej. morgan)

Objetivo proximo:

- centralizacion con Loki + Grafana

## 6.9 Nginx + SSL

Config base de `server_name` en `API_DOMAIN`.

Proxy al backend interno (`backend:BACKEND_PORT`).

Emitir certificado con Certbot para `API_DOMAIN`.

## 6.10 Cloudflare

Config minima:

- SSL mode: `Full (strict)`
- Proxy: `ON`
- Rate limiting: habilitado
- Bot protection: habilitado

---

## 7) Definition of Done (DoD)

Se considera terminado cuando:

1. `https://API_DOMAIN/health` responde 200.
2. Deploy automatico funciona con push real a `main`.
3. Existe backup del dia y se puede listar en `BACKUP_DIR`.
4. Renovacion SSL activa sin errores.
5. Firewall activo y puertos minimos expuestos.

---

## 8) Checklist de verificacion rapida

- [ ] Cloudflare proxy activo
- [ ] Cert SSL valido
- [ ] `docker ps` sin reinicios anormales
- [ ] DB con volumen persistente
- [ ] Restore de backup probado
- [ ] Workflow de GitHub Actions en verde

---

## 9) Siguientes pasos (no bloqueantes de hoy)

1. Estructura multi-tenant en backend.
2. Integracion de WhatsApp.
3. UI profesional.
4. Endurecimiento avanzado (fail2ban, auditd, SSH hardening extra, IDS).
5. Postgres tuning para 32GB (memoria, autovacuum, checkpoints, pool).

---

## 10) Anti-patterns a evitar

- Meter Kubernetes ahora (overkill para este estadio).
- Exponer DB/Redis publicamente.
- Deploy manual permanente sin CI/CD.
- Backups sin prueba de restore.
- Mezclar secretos en repositorio.

---

## 11) Prioridad de decision

Cuando haya conflicto, decidir en este orden:

1. Disponibilidad del servicio
2. Seguridad basica
3. Recuperacion ante fallos
4. Simplicidad operativa para 2 devs
5. Optimizacion/performance fina

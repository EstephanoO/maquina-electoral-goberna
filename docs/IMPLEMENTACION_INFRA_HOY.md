# Implementacion Infra Hoy

Este plan ejecuta el objetivo de `AGENTS.md` en tres bloques: repo, VPS, validacion.

## 1) Preparar repo (infra como codigo)

1. Copiar `.env.example` a `.env` y completar parametros reales.
2. Confirmar que existe `backend/.env.local` para desarrollo.
3. Instalar dependencias nuevas del backend:

```bash
cd backend
bun install
```

4. Desarrollo local (sin tocar produccion):

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

5. Produccion local de prueba:

```bash
docker compose up -d --build
```

## 2) Bootstrap VPS (hardening + runtime)

Ejecutar en VPS como root solo durante bootstrap:

```bash
adduser deploy
usermod -aG sudo deploy
apt update && apt upgrade -y
apt install -y docker.io docker-compose-v2 git nginx certbot
systemctl enable docker
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```

Configurar SSH en `/etc/ssh/sshd_config`:

- `PermitRootLogin no`
- `PasswordAuthentication no`

Luego:

```bash
systemctl restart ssh
```

## 3) Estructura en VPS

Como `deploy`:

```bash
sudo mkdir -p /srv/app /srv/backups /srv/app/certbot/www /srv/app/certbot/conf
sudo chown -R deploy:deploy /srv/app /srv/backups
```

Clonar o mover repo a `/srv/app` y crear `.env` real con tus valores.

## 4) Primer deploy en VPS

```bash
cd /srv/app
docker compose up -d --build
docker compose ps
curl -I http://API_DOMAIN/health
```

## 5) Emitir SSL y activar template HTTPS

Con DNS ya apuntando al VPS:

```bash
sudo certbot certonly --webroot -w /srv/app/certbot/www -d API_DOMAIN
```

Editar `.env` en VPS:

- `NGINX_TEMPLATE=default.https.conf.template`

Recrear Nginx:

```bash
cd /srv/app
docker compose up -d --build nginx
curl -I https://API_DOMAIN/health
```

## 6) CI/CD

GitHub secrets minimos:

- `VPS_HOST`
- `SSH_PRIVATE_KEY`

Opcional:

- `VPS_PORT`

Workflow ya definido en `.github/workflows/deploy.yml`.

## 7) Backups automaticos

Dar permisos:

```bash
cd /srv/app
chmod +x scripts/backup.sh scripts/restore-smoke-test.sh
```

Probar backup:

```bash
cd /srv/app
./scripts/backup.sh
ls -lah /srv/backups
```

Probar restore:

```bash
cd /srv/app
./scripts/restore-smoke-test.sh
```

Cron diario 03:00:

```bash
crontab -e
```

Linea:

```cron
0 3 * * * cd /srv/app && ./scripts/backup.sh >> /var/log/app-backup.log 2>&1
```

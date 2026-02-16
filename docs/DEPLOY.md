# Deploy Guide - Goberna Platform

> **Versión:** 1.0  
> **Última actualización:** Febrero 2026  
> **Hereda de:** [/AGENTS.md](../AGENTS.md)

---

## Índice

1. [Arquitectura de Deploy](#1-arquitectura-de-deploy)
2. [Backend (VPS)](#2-backend-vps)
3. [Frontend (Vercel)](#3-frontend-vercel)
4. [Mobile (Expo)](#4-mobile-expo)
5. [Rollback](#5-rollback)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Arquitectura de Deploy

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub (main branch)                      │
└─────────────────────────────────────────────────────────────────┘
                    │                           │
                    │ push                      │ push
                    ▼                           ▼
    ┌───────────────────────────┐   ┌───────────────────────────┐
    │   .github/workflows/      │   │   .github/workflows/      │
    │   deploy.yml              │   │   frontend-ci-cd.yml      │
    │   (Backend CI/CD)         │   │   (Frontend CI/CD)        │
    └─────────────┬─────────────┘   └─────────────┬─────────────┘
                  │                               │
                  │ SSH                           │ Webhook
                  ▼                               ▼
    ┌───────────────────────────┐   ┌───────────────────────────┐
    │   VPS 161.132.39.165      │   │   Vercel                  │
    │   /srv/app                │   │   Auto-deploy             │
    │   docker-compose up       │   │   apps/web                │
    └───────────────────────────┘   └───────────────────────────┘
```

---

## 2. Backend (VPS)

### 2.1 Infraestructura

| Recurso | Valor |
|---------|-------|
| Host | `161.132.39.165` |
| Usuario SSH | `deploy` |
| Directorio | `/srv/app` |
| Puerto SSH | Definido en `VPS_PORT` secret |
| RAM | 32GB |

### 2.2 Deploy Automático (CI/CD)

El deploy se ejecuta automáticamente cuando:
- Push a `main` branch
- Jobs `quality` y `security` pasan

**Workflow:** `.github/workflows/deploy.yml`

**Proceso:**
1. Typecheck backend (`bunx tsc --noEmit`)
2. Smoke contract tests
3. Architecture contracts check
4. Security scan (gitleaks + trivy)
5. SSH al VPS
6. `git pull --ff-only`
7. `docker compose up -d --build`
8. Migraciones
9. Smoke tests en producción
10. Rollback automático si falla

### 2.3 Deploy Manual

```bash
# Conectar al VPS
ssh -i ~/.ssh/id_ed25519 deploy@161.132.39.165

# Ir al directorio del proyecto
cd /srv/app

# Pull cambios
git fetch origin main
git pull --ff-only origin main

# Rebuild y deploy
docker compose up -d --build --remove-orphans

# Correr migraciones
docker compose exec backend bun run migrate

# Verificar salud
curl http://127.0.0.1/api/health
curl http://127.0.0.1/api/ready
```

### 2.4 Verificación Post-Deploy

```bash
# Health checks
curl -s http://161.132.39.165/api/health | jq
curl -s http://161.132.39.165/api/ready | jq

# Ver logs
docker compose logs -f backend --tail=100

# Estado de containers
docker compose ps

# Verificar recursos
docker stats --no-stream
```

### 2.5 Secrets Requeridos (GitHub)

| Secret | Descripción |
|--------|-------------|
| `VPS_HOST` | `161.132.39.165` |
| `VPS_PORT` | Puerto SSH |
| `SSH_PRIVATE_KEY` | Clave privada del usuario `deploy` |

### 2.6 Variables de Entorno (VPS)

Archivo: `/srv/app/.env`

```bash
# Obligatorias
DATABASE_URL=postgresql://user:pass@postgres:5432/goberna
REDIS_URL=redis://redis:6379
JWT_SECRET=<min-32-chars>
AGENT_INGEST_TOKEN=<token-para-tracking>

# Opcionales
PORT=3001
LOG_LEVEL=info
TEGOLA_BASE_URL=http://tegola:8080
```

---

## 3. Frontend (Vercel)

### 3.1 Configuración

| Recurso | Valor |
|---------|-------|
| Proyecto | `maquina-electoral-goberna-web` |
| URL Producción | `https://maquina-electoral-goberna-web.vercel.app` |
| Framework | Next.js |
| Root Directory | `apps/web` |

### 3.2 Deploy Automático

Vercel detecta pushes a `main` y despliega automáticamente.

**Condiciones para deploy:**
- Cambios en `apps/web/**`
- Build exitoso (`bun run build`)
- Typecheck sin errores

### 3.3 Variables de Entorno (Vercel Dashboard)

```bash
# Producción
BACKEND_PROXY_TARGET=http://161.132.39.165
```

### 3.4 Verificación CI

El workflow `.github/workflows/frontend-ci-cd.yml`:
1. Typecheck
2. Build
3. Architecture contracts
4. Health check de producción (post-deploy)

### 3.5 Deploy Manual (si es necesario)

```bash
cd apps/web

# Instalar Vercel CLI
bun add -g vercel

# Deploy preview
vercel

# Deploy producción
vercel --prod
```

### 3.6 Secrets Requeridos (GitHub)

| Secret | Descripción |
|--------|-------------|
| `FRONTEND_PROD_URL` | URL de producción para health check |

---

## 4. Mobile (Expo)

### 4.1 Configuración

| Recurso | Valor |
|---------|-------|
| SDK | Expo 54 |
| React Native | 0.81 |
| Directorio | `apps/mobile` |

### 4.2 Desarrollo Local

```bash
cd apps/mobile

# Instalar dependencias
bun install

# Iniciar dev server
bun start

# iOS Simulator
bun run ios

# Android Emulator
bun run android
```

### 4.3 Build para Producción

```bash
# Instalar EAS CLI
bun add -g eas-cli

# Login a Expo
eas login

# Build Android (APK)
eas build --platform android --profile preview

# Build iOS (requiere Apple Developer Account)
eas build --platform ios --profile preview

# Build ambas plataformas
eas build --platform all --profile production
```

### 4.4 Configuración de Builds

Archivo: `apps/mobile/eas.json`

```json
{
  "cli": {
    "version": ">= 3.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "distribution": "store"
    }
  }
}
```

### 4.5 Variables de Entorno (app.json)

```json
{
  "expo": {
    "extra": {
      "EXPO_PUBLIC_BACKEND_API_URL": "http://161.132.39.165/api",
      "EXPO_PUBLIC_AGENT_INGEST_TOKEN": "<token>"
    }
  }
}
```

### 4.6 OTA Updates

```bash
# Publicar update OTA (sin rebuild)
eas update --branch production --message "Fix crítico"

# Ver updates publicados
eas update:list
```

---

## 5. Rollback

### 5.1 Backend (VPS)

**Rollback automático:** El CI/CD hace rollback automático si el smoke test falla.

**Rollback manual:**

```bash
ssh deploy@161.132.39.165
cd /srv/app

# Ver commits anteriores
git log --oneline -10

# Rollback a commit específico
git reset --hard <commit-hash>
docker compose up -d --build --remove-orphans

# Verificar
curl http://127.0.0.1/api/health
```

### 5.2 Frontend (Vercel)

1. Ir al [Vercel Dashboard](https://vercel.com)
2. Seleccionar proyecto `maquina-electoral-goberna-web`
3. Ir a "Deployments"
4. Buscar deploy anterior estable
5. Click "..." → "Promote to Production"

### 5.3 Mobile

Los builds de mobile son inmutables. Para rollback:

1. Ir a [Expo Dashboard](https://expo.dev)
2. Seleccionar proyecto
3. Ir a builds anteriores
4. Re-distribuir el build anterior

---

## 6. Troubleshooting

### 6.1 Backend no responde

```bash
# Ver estado de containers
ssh deploy@161.132.39.165
cd /srv/app
docker compose ps

# Ver logs del backend
docker compose logs backend --tail=200

# Reiniciar servicios
docker compose restart backend

# Rebuild completo
docker compose down
docker compose up -d --build
```

### 6.2 Database connection failed

```bash
# Verificar PostgreSQL
docker compose exec postgres pg_isready

# Ver logs de postgres
docker compose logs postgres --tail=50

# Conectar manualmente
docker compose exec postgres psql -U goberna -d goberna
```

### 6.3 Redis connection failed

```bash
# Verificar Redis
docker compose exec redis redis-cli ping

# Ver memoria Redis
docker compose exec redis redis-cli info memory
```

### 6.4 Frontend proxy error

```bash
# Verificar que backend responde
curl http://161.132.39.165/api/health

# Verificar variable de entorno en Vercel
# BACKEND_PROXY_TARGET debe apuntar al VPS
```

### 6.5 Mobile no conecta al backend

1. Verificar URL en `app.json`:
   ```json
   "EXPO_PUBLIC_BACKEND_API_URL": "http://161.132.39.165/api"
   ```

2. Verificar que el dispositivo tiene internet

3. Para desarrollo local, usar IP de la máquina (no localhost):
   ```json
   "EXPO_PUBLIC_BACKEND_API_URL": "http://192.168.x.x:3001/api"
   ```

### 6.6 Smoke tests fallan en CI

```bash
# Ver output del CI en GitHub Actions

# Ejecutar smoke tests localmente
cd scripts/ci
bash smoke_backend_contract.sh
```

---

## Checklist Pre-Deploy

### Backend
- [ ] `bunx tsc --noEmit` sin errores
- [ ] Tests pasan localmente
- [ ] `.env` actualizado en VPS si hay nuevas variables
- [ ] Migraciones preparadas

### Frontend
- [ ] `bun run build` exitoso
- [ ] Variables de entorno en Vercel actualizadas
- [ ] Proxy target correcto

### Mobile
- [ ] `bunx tsc --noEmit` sin errores
- [ ] `app.json` con URLs correctas
- [ ] EAS configurado

---

## Contactos de Emergencia

| Rol | Responsabilidad |
|-----|-----------------|
| DevOps | Acceso VPS, Docker, CI/CD |
| Backend | API, Database, Redis |
| Frontend | Vercel, Next.js |
| Mobile | Expo, React Native |

---

*Este documento es parte de la documentación oficial de Goberna Platform.*

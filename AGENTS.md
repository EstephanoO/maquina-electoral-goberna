# AGENTS.md - Goberna Platform (Root Source of Truth)

> **Regla #1:** Este archivo es la fuente de verdad absoluta del monorepo. Los AGENTS.md de cada app heredan de este. Si hay conflicto, este archivo prevalece.
> **Ultima actualizacion:** 2026-02-23

---

## 1. Identidad del Producto

**Goberna** es una plataforma SaaS de operacion territorial para campanas politicas en Peru.

| Aspecto | Detalle |
|---------|---------|
| Organizacion | Grupo Goberna |
| Mercado | Peru (conectividad intermitente, campo operativo real) |
| Diferenciador | Offline-first, mapas vectoriales, CRM/CMS integrado, multi-campana |
| Equipo | EstephanoO (lead) + Maximoff19 (dev CMS) |
| Prioridad | Operabilidad > Sofisticacion |

### Equipo y Responsabilidades

| Persona | GitHub | Rol | Area |
|---------|--------|-----|------|
| EstephanoO | `@EstephanoO` | Lead / Reviewer | Todo el sistema |
| Maximoff19 | `@Maximoff19` | Developer | CMS + Twilio (`apps/backend/src/modules/cms/`, `twilio/`, `apps/web/app/(dashboard)/cms/`) |

### Documentacion de Desarrollo

| Archivo | Proposito |
|---------|-----------|
| `CONTRIBUTING.md` | Flujo GitHub Flow, convenciones, guia para ambos devs |
| `ONBOARDING.md` | Setup rapido para nuevos integrantes |
| `CMS_DEVELOPER_GUIDE.md` | Guia tecnica completa del modulo CMS + Twilio |

---

## 2. Estructura del Monorepo

```
nexus6.0/
  AGENTS.md                    <- Este archivo (root, fuente de verdad)
  .agents/                     <- Orquestacion de agentes y skills
  apps/
    backend/                   <- Fastify API (VPS produccion)
      AGENTS.md                <- Hereda de root
    web/                       <- Next.js Admin Dashboard (Vercel)
      AGENTS.md                <- Hereda de root
    mobile/                    <- Expo App (agentes de campo)
      AGENTS.md                <- Hereda de root
  docs/                        <- Documentacion compartida
  scripts/                     <- Scripts de desarrollo
  deploy/                      <- Configs de deploy
  nginx/                       <- Templates Nginx (Cloudflare origin, HTTP, HTTPS)
  tegola/                      <- Config Tegola (config.toml)
  docker-compose.yml           <- Produccion
  docker-compose.dev.yml       <- Desarrollo local
```

---

## 3. Arquitectura de Produccion

```
                    +------------------+
                    |   Cloudflare     |
                    |   (DNS + Proxy)  |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
     +--------v--------+          +---------v---------+
     |    Vercel       |          |   VPS (32GB)      |
     |   (apps/web)    |          |   161.132.39.165  |
     |                 |          |   api.goberna.us   |
     +-----------------+          |                   |
                                  |  +-------------+  |
                                  |  |   Nginx     |  |
                                  |  +------+------+  |
                                  |         |         |
                                  |  +------v------+  |
                                  |  |   Backend   |  |
                                  |  |  (Fastify)  |  |
                                  |  +------+------+  |
                                  |         |         |
                                  +----+----+----+----+
                                       |    |    |
                             +---------+    |    +---------+
                             |              |              |
                      +------v-----+ +------v-----+ +------v------+
                      | PostgreSQL | |   Redis    | |   Tegola    |
                      |  + PostGIS | |  (Streams) | | (MVT tiles) |
                      +------------+ +------------+ +-------------+
```

**Dominios publicos:**
- API: `https://api.goberna.us` (Cloudflare → Nginx → Backend)
- Web: `https://dashboard.grupogoberna.com` (Vercel)

---

## 4. Stack Tecnologico (Estado Actual)

| Capa | Tecnologia | Ubicacion | Estado |
|------|-----------|-----------|--------|
| Backend API | Fastify 5.6 + TypeScript 5.9 + Bun | `apps/backend/` | **Produccion** |
| Base de Datos | PostgreSQL 15 + PostGIS 3.4 | Docker VPS | **Produccion** |
| Cache/Queues | Redis 7.4 (Streams) | Docker VPS | **Produccion** |
| Vector Tiles | Tegola | Docker VPS | **Produccion** |
| Web Admin | Next.js 16.1 + React 19.2 + Tailwind 4 | `apps/web/` | **Produccion** (Vercel) |
| Mobile App | Expo SDK 54 + React Native 0.81 | `apps/mobile/` | **Desarrollo** |
| ORM | Drizzle ORM 0.44 | `apps/backend/` | **Produccion** |
| Messaging | Twilio (WhatsApp) | `apps/backend/` | **Produccion** |
| CI/CD | GitHub Actions | `.github/workflows/` | **Produccion** |

**Dependencias clave del backend:** fastify, @fastify/websocket, drizzle-orm, jose (JWT), bcryptjs, zod, redis, twilio, pg

---

## 5. Infraestructura de Produccion

| Recurso | Valor |
|---------|-------|
| VPS Host | `161.132.39.165` |
| VPS RAM | 32GB |
| SSH User | `deploy` |
| Project Dir | `/srv/app` |
| Timezone | `America/Lima` |
| API Domain | `api.goberna.us` |
| Frontend Domain | `dashboard.grupogoberna.com` |
| Frontend Host | Vercel (maquina-electoral-goberna-web) |
| DNS/Edge | Cloudflare (proxy ON) |

---

## 6. Contratos API (Vigentes)

### Endpoints Publicos (sin auth)
| Endpoint | Descripcion |
|----------|-------------|
| `GET /api/health` | Liveness check |
| `GET /api/ready` | Readiness (DB + Redis + Tegola) |
| `POST /api/auth/login` | Login email/password |
| `POST /api/auth/register` | Registro de usuario |
| `GET /api/candidates` | Lista de candidatos/campanas |
| `GET /api/invitations/validate/:code` | Validar codigo de invitacion |
| `POST /api/webhooks/twilio/whatsapp` | Webhook Twilio (firmado) |

### Endpoints Autenticados (JWT Bearer)
| Endpoint | Descripcion |
|----------|-------------|
| `GET /api/auth/me` | Perfil + campanas del usuario |
| `POST /api/auth/refresh` | Renovar tokens |
| `POST /api/auth/logout` | Cerrar sesion |
| **Campaigns** | |
| `GET /api/campaigns` | Listar campanas del usuario (admin ve todas) |
| `GET /api/campaigns/:id` | Config de campana |
| `POST /api/campaigns` | Crear campana (admin) |
| `PUT /api/campaigns/:id` | Actualizar campana (jefe_campana+) |
| `GET /api/campaigns/:slug/stats` | Stats del dashboard |
| `GET /api/campaigns/:id/members` | Listar miembros (jefe_campana+) |
| `POST /api/campaigns/:id/members` | Agregar miembro (admin) |
| `DELETE /api/campaigns/:id/members/:userId` | Remover miembro (admin) |
| `PUT /api/campaigns/:id/members/:userId/role` | Cambiar rol (jefe_campana+) |
| **Forms** | |
| `GET /api/form-definitions/active` | Formularios activos |
| `POST /api/forms` | Submit formulario (legacy write-behind) |
| `POST /api/forms/batch` | Submit batch (legacy write-behind) |
| `POST /api/form-submissions` | Submit formulario (nuevo, directo) |
| `POST /api/form-submissions/batch` | Submit batch (nuevo, directo) |
| `GET /api/form-submissions` | Listar submissions por campana |
| `GET /api/form-submissions/recent` | Submissions recientes |
| `GET /api/form-submissions/meet/:meetId` | Submissions de un meet |
| `GET /api/form-submissions/stats` | Stats de submissions |
| **Meets** | |
| `GET /api/meets` | Listar meets de campana |
| `POST /api/meets` | Crear meet |
| `PUT /api/meets/:id` | Actualizar meet |
| `PUT /api/meets/:id/status` | Cambiar estado de meet |
| **Zones** | |
| `GET /api/zones/campaign/:campaignId` | Listar zonas de campana |
| `GET /api/zones/campaign/:campaignId/geojson` | Zonas como GeoJSON FeatureCollection |
| `GET /api/zones/:id` | Detalle de zona |
| `POST /api/zones` | Crear zona (jefe_campana+) |
| `PUT /api/zones/:id` | Actualizar zona |
| `DELETE /api/zones/:id` | Eliminar zona |
| **Org Hierarchy** | |
| `GET /api/org-hierarchy/campaign/:campaignId` | Arbol organizacional |
| `GET /api/org-hierarchy/campaign/:campaignId/subordinates/:userId` | Subordinados de un usuario |
| `POST /api/org-hierarchy` | Asignar relacion supervisor |
| `PUT /api/org-hierarchy/:id` | Actualizar nodo |
| `DELETE /api/org-hierarchy/:id` | Remover relacion |
| **Invitations** | |
| `POST /api/invitations` | Crear invitacion (jefe_campana+) |
| `GET /api/invitations/campaign/:campaignId` | Listar invitaciones de campana |
| `DELETE /api/invitations/:id` | Revocar invitacion |
| **Access Requests** | |
| `GET /api/access-requests` | Listar solicitudes (jefe_campana+) |
| `POST /api/access-requests/:id/resolve` | Aprobar/rechazar solicitud |
| **Analytics (GA4)** | |
| `POST /api/campaigns/:campaignId/analytics` | Guardar datos GA4 (candidato+) |
| `GET /api/campaigns/:campaignId/analytics` | Obtener datos GA4 |
| `GET /api/analytics/by-slug/:slug` | Analytics por slug de campana |
| `DELETE /api/campaigns/:campaignId/analytics` | Eliminar datos GA4 (admin) |
| **CMS (Contact Management)** | |
| `GET /api/cms/contacts` | Listar contactos con filtro/busqueda |
| `PUT /api/cms/contacts/:id/claim` | Reclamar contacto (lock) |
| `PUT /api/cms/contacts/:id/release` | Liberar contacto |
| `PUT /api/cms/contacts/:id/hablado` | Marcar como hablado |
| `PUT /api/cms/contacts/:id/respondieron` | Marcar como respondieron |
| `PUT /api/cms/contacts/:id/revert` | Revertir un paso atras |
| `PUT /api/cms/contacts/:id/archive` | Archivar contacto |
| `PUT /api/cms/contacts/:id/notes` | Actualizar notas del operador |
| `GET /api/cms/stats` | Stats CMS por campana |
| `GET /api/cms/metrics` | Metricas CMS global (candidato+) |
| `GET /api/cms/metrics/brigadistas` | Metricas por brigadista con dedup telefono |
| `GET /api/cms/metrics/by-source` | Metricas por origen de contacto (territorio/meta/manual) |
| `GET /api/cms/metrics/devices` | Metricas por dispositivo WA (Celular N) + operador activo |
| `POST /api/cms/device-heartbeat` | Heartbeat sesion operador+dispositivo (extension, cada 5 min) |
| `POST /api/cms/extension-event` | Evento de extension (mensaje entrante detectado en WA Web) |
| `POST /api/cms/contacts/public` | Crear contacto publico por campaign_slug (sin auth) |
| `GET /api/cms/stream` | SSE eventos realtime del CMS |
| **Meta Lead Ads** | |
| `GET /api/webhooks/meta/leads` | Verificacion de webhook Meta (challenge) |
| `POST /api/webhooks/meta/leads` | Ingesta de leads desde Meta Lead Ads (contact_source=meta) |
| **Objectives** | |
| `GET /api/objectives/zones` | Objetivos por zona |
| `PUT /api/objectives/zones/:region` | Crear/actualizar objetivo zona |
| `POST /api/objectives/zones/bulk` | Bulk upsert objetivos zona |
| `DELETE /api/objectives/zones/:region` | Eliminar objetivo zona |
| `GET /api/objectives/users` | Objetivos efectivos por usuario |
| `PUT /api/objectives/users/:userId` | Setear objetivo usuario |
| `GET /api/objectives/summary` | Resumen de progreso |
| **Twilio (WhatsApp)** | |
| `POST /api/twilio/whatsapp/send` | Enviar mensaje WA a contacto CMS |
| `GET /api/twilio/whatsapp/messages/:contactId` | Historial de conversacion WA |
| **Metrics / Ops** | |
| `GET /api/metrics` | Metricas operativas (admin) |

### Endpoints de Tracking (x-agent-token)
| Endpoint | Descripcion |
|----------|-------------|
| `POST /api/agents/location` | Enviar ubicacion (+ history append) |
| `POST /api/agents/locations/batch` | Enviar batch de ubicaciones (hasta 100) |
| `GET /api/agents/live` | Posiciones actuales |
| `GET /api/agents/stream` | SSE de posiciones |
| `GET /api/agents/health` | Health del tracking |

### WebSocket Tracking (wss://)
| Endpoint | Descripcion |
|----------|-------------|
| `GET /ws/tracking?token=<agent_token>` | WebSocket bidireccional para ingest de ubicaciones mobile |
| `GET /ws/tracking/health` | Health del WS tracking |

**Protocolo WS (JSON):**
- **Client→Server:** `{ type: "location", data: LocationPayload }` / `{ type: "location.batch", data: LocationPayload[] }` / `{ type: "ping" }`
- **Server→Client:** `{ type: "ack", seq, accepted, deduped }` / `{ type: "ack.batch", accepted, deduped, failed }` / `{ type: "config", interval_ms?, distance_m? }` / `{ type: "pong" }` / `{ type: "error", code, message }`

---

## 7. Variables de Entorno por App

### Backend (`apps/backend/.env`)
```bash
# === OBLIGATORIAS ===
DATABASE_URL=postgresql://user:pass@localhost:5432/db
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=<password>
JWT_SECRET=<minimo-32-caracteres>
AGENT_INGEST_TOKEN=<token-para-tracking>

# === OPCIONALES (con defaults) ===
PORT=3001
BACKEND_PORT=3001
LOG_LEVEL=info
TEGOLA_BASE_URL=http://localhost:8080
TEGOLA_MAP=peru
FRONTEND_ORIGIN=https://dashboard.grupogoberna.com
FRONTEND_ORIGINS=*
RATE_LIMIT_MAX_PER_MINUTE=500000
RATE_LIMIT_AUTH_PER_MINUTE=10
RATE_LIMIT_FORMS_PER_MINUTE=1200
RATE_LIMIT_AGENTS_LOCATION_PER_MINUTE=12000
REFRESH_TOKEN_CLEANUP_INTERVAL_MS=3600000
LOCATION_HISTORY_RETENTION_DAYS=7
JWT_ACCESS_EXPIRES_IN=365d
JWT_REFRESH_EXPIRES_IN=365d
BCRYPT_ROUNDS=10
REQUEST_TIMEOUT_MS=5000
UPSTREAM_RETRIES=2

# === WRITE-BEHIND CONFIG ===
FORMS_WB_BATCH_SIZE=200
FORMS_WB_FLUSH_MS=300
FORMS_WB_MAX_QUEUE=10000
TRACKING_WB_BATCH_SIZE=300
TRACKING_WB_FLUSH_MS=250
TRACKING_WB_MAX_QUEUE=10000

# === REDIS STREAMS ===
TRACKING_STREAM_KEY=tracking:events
FORMS_STREAM_KEY=forms:events
FORMS_DEDUPE_TTL_SEC=604800

# === DB POOL ===
DB_POOL_MAX=30
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=5000
```

### Web (`apps/web/.env.local`)
```bash
# Desarrollo local
BACKEND_PROXY_TARGET=http://localhost:3001

# Produccion (en Vercel env vars)
# BACKEND_PROXY_TARGET=https://api.goberna.us
```

### Mobile (`apps/mobile/app.json` > extra)
```json
{
  "EXPO_PUBLIC_BACKEND_API_URL": "https://api.goberna.us/api",
  "EXPO_PUBLIC_AGENT_INGEST_TOKEN": "<token-NO-commitear-en-git>"
}
```

> **SEGURIDAD:** El `EXPO_PUBLIC_AGENT_INGEST_TOKEN` NO debe tener el valor real en git. Usar EAS secrets o `.env` local.

---

## 8. Comandos de Desarrollo

### Setup inicial
```bash
# Instalar dependencias
cd apps/backend && bun install
cd ../web && bun install
cd ../mobile && bun install

# Levantar infra local
docker compose -f docker-compose.dev.yml up -d

# Correr migraciones
cd apps/backend && bun run migrate

# Crear usuario de prueba
bun run seed
```

### Desarrollo diario
```bash
# Terminal 1: Backend (puerto 3001)
cd apps/backend && bun run dev

# Terminal 2: Web (puerto 3000)
cd apps/web && bun run dev

# Terminal 3: Mobile
cd apps/mobile && bun start
```

### Verificacion
```bash
# Health check local
curl http://localhost:3001/api/health
curl http://localhost:3001/api/ready

# Health check produccion
curl https://api.goberna.us/api/health
curl https://api.goberna.us/api/ready
```

---

## 9. Flujo de Desarrollo (GitHub Flow)

### Ramas

| Tipo | Patron | Proposito |
|------|--------|-----------|
| `main` | Protegida | Produccion. Nadie pushea directo. |
| `feature/*` | Temporal | Nueva funcionalidad |
| `hotfix/*` | Temporal | Fix urgente en produccion |

### Proceso

```
1. Crear rama desde main:  git checkout -b feature/nombre-descriptivo
2. Desarrollar + commits atomicos
3. Push:  git push -u origin feature/nombre-descriptivo
4. Crear PR en GitHub (usa template automatico)
5. EstephanoO revisa y aprueba (CODEOWNERS)
6. Squash merge a main
7. CI despliega automaticamente
```

### Reglas

- **Squash merge siempre** — main limpio, un commit por PR
- **PR obligatorio** — sin push directo a main (convencion, GitHub Free no lo enforce)
- **CODEOWNERS** — `@EstephanoO` auto-asignado como reviewer
- **CI corre en cada PR** — type check backend, build web, gitleaks
- **CI corre en push a main** — deploy automatico al VPS

### CI/CD Pipeline (`.github/workflows/deploy.yml`)

```
PR abierto/actualizado:
  → Type check backend (bunx tsc --noEmit)
  → Build web (bun run build)
  → Gitleaks (scan de secretos)
  → Smoke test (health + register + login)

Push a main:
  → Mismos checks
  → Deploy al VPS (SSH + docker compose)
  → Verify (health + ready)
```

### Archivos de Configuracion

| Archivo | Proposito |
|---------|-----------|
| `.github/workflows/deploy.yml` | Pipeline CI/CD completo |
| `.github/CODEOWNERS` | Auto-assign reviewer |
| `.github/pull_request_template.md` | Template de PR |
| `CONTRIBUTING.md` | Guia detallada del flujo |
| `ONBOARDING.md` | Setup rapido para nuevos devs |

---

## 10. Principios de Arquitectura (No Negociables)

1. **Offline-first siempre.** Peru tiene conectividad intermitente.
2. **Multi-tenant por campaign_id.** Todo aislado por campana.
3. **JSONB para formularios.** Estructura dinamica, no columnas fijas.
4. **Write-behind en Redis.** Ingesta rapida, persistencia eventual.
5. **Contratos explicitos.** Web/Mobile/Backend comparten semantica.
6. **Seguridad server-side.** Las apps son untrusted.

---

## 11. Reglas de Herencia de AGENTS.md

Cada app tiene su propio `AGENTS.md` que:

1. **DEBE** declarar `Hereda de: /AGENTS.md` al inicio
2. **DEBE** limitarse a su modulo (no redefinir arquitectura global)
3. **DEBE** mantener DoD alineado al root
4. **NO DEBE** contradecir el root (si hay conflicto, prevalece root)
5. **PUEDE** agregar reglas especificas de su dominio

### Jerarquia
```
/AGENTS.md (root - este archivo)
    |
    +-- /.agents/AGENTS.md              <- Orquestacion de agentes
    |
    +-- /apps/backend/AGENTS.md         <- Backend Fastify
    |   +-- /apps/backend/src/modules/AGENTS.md  <- Convenciones de modulos
    |
    +-- /apps/web/AGENTS.md             <- Web Next.js
    |   +-- /apps/web/.agents/AGENTS.md <- Skills web
    |   +-- /apps/web/app/AGENTS.md     <- Reglas de rutas
    |
    +-- /apps/mobile/AGENTS.md          <- Mobile Expo
```

**No deben existir** AGENTS.md individuales por modulo del backend (auth, campaigns, etc). Todo se consolida en `apps/backend/src/modules/AGENTS.md`.

---

## 12. Definition of Done (Global)

Cualquier cambio debe cumplir:

| App | Comando | Resultado |
|-----|---------|-----------|
| Backend | `bunx tsc --noEmit` | Sin errores |
| Web | `bun run build` | Build exitoso |
| Mobile | `bunx tsc --noEmit` | Sin errores |
| Produccion | `curl /api/health` | 200 OK |
| Produccion | `curl /api/ready` | 200 OK |

---

## 13. Estado Actual Consolidado

> **IMPORTANTE:** Este estado manda sobre cualquier supuesto viejo en AGENTS.md locales.

1. Backend productivo activo en `apps/backend/` (no `backend/` legacy)
2. Web productivo activo en `apps/web/` (antes `nexus-web/`)
3. Mobile en desarrollo en `apps/mobile/` (antes `goberna-territory0.2/`)
4. Ingesta de tracking y forms con write-behind en Redis Streams
5. Redis en produccion con politica `noeviction`
6. `AGENT_INGEST_TOKEN` obligatorio en produccion para tracking
7. `/api/metrics` expone latencias por ruta con p50/p90/p95/p99
8. Autenticacion dual-mode: cookies httpOnly (web) + Bearer tokens (mobile) — ver seccion 13.1
9. Next.js middleware fail-closed protege rutas del dashboard server-side
10. CORS bloqueado en produccion si `FRONTEND_ORIGINS=*` (fail-safe)

---

## 13.1 Arquitectura de Seguridad (Auth Dual-Mode)

El backend sirve a **dos clientes** con mecanismos de auth distintos:

| Cliente | Transporte de tokens | Storage | Refresh |
|---------|---------------------|---------|---------|
| **Web** (Next.js via Vercel proxy) | httpOnly cookies (automatico) | Cookies del browser | `POST /api/auth/refresh` con cookie |
| **Mobile** (Expo directo) | `Authorization: Bearer` header | SecureStore | `POST /api/auth/refresh` con body JSON |

### Cookies que setea el backend (login + refresh)

| Cookie | httpOnly | Path | Max-Age | Proposito |
|--------|----------|------|---------|-----------|
| `goberna_access_token` | Si | `/` | 31536000 (1 año) | JWT de acceso |
| `goberna_refresh_token` | Si | `/api/auth` | 31536000 (1 año) | JWT de refresh (scope restringido) |
| `goberna_session` | No | `/` | 31536000 (1 año) | Flag `"1"` — Next.js middleware detecta sesion |

### Resolucion de token (`src/infra/auth.ts`)

```
1. Authorization: Bearer <token>  → si existe, usar (mobile/programmatic)
2. Cookie: goberna_access_token   → fallback (web via httpOnly cookie)
3. Si ninguno → 401 AUTH_TOKEN_MISSING
```

### Reglas de seguridad (No Negociables)

- **NUNCA** guardar tokens en localStorage/sessionStorage en la web
- **NUNCA** leer el JWT desde JavaScript en el browser (es httpOnly)
- El flag `goberna_session=1` es el unico indicador client-side de sesion
- En produccion, cookies llevan flag `Secure` (solo HTTPS)
- El refresh cookie tiene `Path=/api/auth` (scope restringido)
- Las cookies funcionan via proxy Next.js porque el browser ve same-origin `/api/*`
- En fallo de refresh, el backend **limpia todas las cookies** para evitar retry loops

### Politica CORS

- En produccion, `FRONTEND_ORIGINS=*` **bloquea todas las requests** cross-origin (fail-safe)
- El backend loguea `.error()` al arrancar si detecta wildcard + produccion
- Siempre usar origenes explicitos en produccion: `FRONTEND_ORIGINS=https://dashboard.grupogoberna.com`
- `credentials: true` siempre activo (necesario para cookies)

### Middleware Next.js (`apps/web/middleware.ts`)

- Protege rutas server-side **ANTES** de renderizar cualquier contenido
- Modelo **fail-closed**: rutas desconocidas se tratan como protegidas
- Solo rutas explicitamente publicas pasan sin auth: `/`, `/login`, `/register`, `/onboarding`, `/mapa`
- Chequea cookie `goberna_session` — si no existe, redirect a `/login?from=<path>`
- Agrega security headers a todas las respuestas (X-Frame-Options: DENY, nosniff, HSTS, Referrer-Policy, Permissions-Policy)

### SSE con auth cookie (patron obligatorio para web)

Toda conexion SSE en el dashboard debe:

1. Usar `credentials: "same-origin"` en el `fetch()`
2. Manejar 401 intentando `POST /api/auth/refresh` una vez
3. Re-intentar la conexion SSE si el refresh tuvo exito
4. Reconectar con **backoff exponencial** (max 30s), no intervalo fijo
5. Referencia: `use-agent-sse.ts` (agents) y `cms/page.tsx` (CMS)

---

## 14. Reglas Operativas de Produccion

1. **Nunca** subir `.env` a git
2. **Nunca** exponer PostgreSQL ni Redis a internet
3. **Siempre** deploy via `docker compose` en `/srv/app`
4. **Siempre** deploy reproducible por script
5. **Siempre** rollback inmediato si falla deploy

---

## 15. Anti-patterns a Evitar

- Kubernetes (overkill para 2 devs)
- Exponer DB/Redis publicamente
- Deploy manual sin CI/CD
- Backups sin test de restore
- Secretos en repositorio
- Documentacion desactualizada
- Guardar tokens en localStorage/sessionStorage (web)
- Usar `window`/`document` en render inicial de componentes (hydration mismatch)
- CORS con wildcard `*` en produccion
- Reconexion SSE con intervalo fijo (usar backoff exponencial)
- Leer `process.env` directamente en modulos (usar `env` centralizado de `config/env.ts`)

---

## 16. Prioridad de Decision

Cuando haya conflicto, decidir en este orden:

1. Disponibilidad del servicio
2. Seguridad basica
3. Recuperacion ante fallos
4. Simplicidad operativa para 2 devs
5. Optimizacion/performance

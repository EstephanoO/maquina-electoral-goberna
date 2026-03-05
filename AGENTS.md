# AGENTS.md - Goberna Platform (Root Source of Truth)

> **Regla #1:** Este archivo es la fuente de verdad absoluta del monorepo. Los AGENTS.md de cada app heredan de este. Si hay conflicto, este archivo prevalece.
> **Ultima actualizacion:** 2026-03-05

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
      src/
        app.ts                 <- Composition root: plugins + routes
        server.ts              <- Bootstrap: env + conexiones + listen
        db.ts                  <- Pool PostgreSQL (pg)
        schema.ts              <- Drizzle ORM schema (tipos)
        config/
          env.ts               <- Fuente de verdad de variables de entorno
        contracts/             <- Tipos compartidos entre modulos
        infra/                 <- Infraestructura transversal (auth, redis, metrics, etc)
        modules/               <- 22 modulos de dominio
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

| Capa | Tecnologia | Version | Ubicacion | Estado |
|------|-----------|---------|-----------|--------|
| Backend API | Fastify + TypeScript + Bun | fastify 5.6, ts 5.9 | `apps/backend/` | **Produccion** |
| Base de Datos | PostgreSQL + PostGIS | 15 + 3.4 | Docker VPS | **Produccion** |
| Cache/Queues | Redis | 7.4 (Streams) | Docker VPS | **Produccion** |
| Vector Tiles | Tegola | — | Docker VPS | **Produccion** |
| ORM | Drizzle ORM | 0.44 | `apps/backend/` | **Produccion** |
| Validacion | Zod | 4.x | `apps/backend/` | **Produccion** |
| JWT | jose | 6.x | `apps/backend/` | **Produccion** |
| Messaging | Twilio (WhatsApp) | 5.x | `apps/backend/` | **Produccion** |
| Web Admin | Next.js + React + Tailwind | next 16.1, react 19.2, tailwind 4 | `apps/web/` | **Produccion** (Vercel) |
| Mapas Web | MapLibre GL + vis.gl | maplibre 5.x | `apps/web/` | **Produccion** |
| Data Fetching Web | TanStack Query | 5.x | `apps/web/` | **Produccion** |
| Mobile App | Expo + React Native | SDK 54, RN 0.81 | `apps/mobile/` | **Desarrollo** |
| Offline Mobile | expo-sqlite | 16.x | `apps/mobile/` | **Desarrollo** |
| CI/CD | GitHub Actions | — | `.github/workflows/` | **Produccion** |

**Dependencias clave del backend:** fastify, @fastify/websocket, @fastify/cors, @fastify/helmet, @fastify/rate-limit, drizzle-orm, jose, bcryptjs, zod, redis, twilio, pg

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

### Formato de Respuesta (Standard)

Todo endpoint del backend responde en este formato:

```typescript
// Success
{ ok: true, request_id: string, ...data }

// Error
{ ok: false, request_id: string, code: string, message: string }
```

### Codigos de Error

| Codigo | Descripcion |
|--------|-------------|
| `VALIDATION_ERROR` | Schema Zod invalido |
| `AUTH_TOKEN_MISSING` | Sin token en request |
| `AUTH_TOKEN_EXPIRED` | JWT vencido |
| `AUTH_TOKEN_INVALID` | JWT invalido |
| `AUTH_INVALID_CREDENTIALS` | Login fallido |
| `AUTH_USER_SUSPENDED` | Usuario suspendido |
| `AUTH_REFRESH_INVALID` | Refresh token invalido |
| `AUTH_REFRESH_REVOKED` | Refresh token reutilizado (posible ataque) |
| `AUTH_REFRESH_EXPIRED` | Refresh token expirado |
| `AUTHZ_ROLE_INSUFFICIENT` | Sin permiso de rol |
| `AUTHZ_CAMPAIGN_DENIED` | Sin acceso a la campana |
| `AUTHZ_CAMPAIGN_MISSING` | Falta campaign_id requerido |
| `AUTHZ_PERMISSION_DENIED` | Sin permiso tierra/digital |
| `RATE_LIMITED` | Demasiadas requests |
| `NOT_FOUND` | Recurso no existe |
| `UPSTREAM_ERROR` | Error de servicio externo |
| `ALREADY_CLAIMED` | Contacto CMS ya tomado |
| `TWILIO_SEND_ERROR` | Error enviando WhatsApp |
| `MISSING_CAMPAIGN` | Falta campaign_id |

### Endpoints Publicos (sin auth)

| Endpoint | Descripcion |
|----------|-------------|
| `GET /api/health` | Liveness check |
| `GET /api/ready` | Readiness (DB + Redis + Tegola) |
| `POST /api/auth/login` | Login email o telefono + password |
| `POST /api/auth/register` | Registro de usuario (telefono como primario) |
| `GET /api/candidates` | Lista de candidatos/campanas |
| `GET /api/invitations/validate/:code` | Validar codigo de invitacion |
| `POST /api/webhooks/twilio/whatsapp` | Webhook Twilio (valida firma X-Twilio-Signature) |
| `POST /api/auth/reset-password` | Reset password con flag activo |
| `POST /api/api/auth/reset-password` | Alias compat mobile (path duplicado) |

### Endpoints Autenticados (JWT Bearer o httpOnly Cookie)

| Endpoint | Descripcion |
|----------|-------------|
| `GET /api/auth/me` | Perfil + campanas del usuario |
| `POST /api/auth/refresh` | Renovar tokens (body JSON mobile / cookie web) |
| `POST /api/auth/logout` | Cerrar sesion (revoca todos los refresh tokens) |
| `POST /api/auth/change-password` | Cambiar password (requiere password actual) |
| `POST /api/users/:userId/require-password-reset` | Marcar usuario para reset (candidato+) |
| **Campaigns** | |
| `GET /api/campaigns` | Listar campanas del usuario (admin ve todas) |
| `GET /api/campaigns/:id` | Config de campana |
| `POST /api/campaigns` | Crear campana (admin) |
| `PUT /api/campaigns/:id` | Actualizar campana (candidato+) |
| `GET /api/campaigns/:slug/stats` | Stats del dashboard |
| `GET /api/campaigns/:id/members` | Listar miembros (candidato+) |
| `POST /api/campaigns/:id/members` | Agregar miembro (admin) |
| `DELETE /api/campaigns/:id/members/:userId` | Remover miembro (admin) |
| `PUT /api/campaigns/:id/members/:userId/role` | Cambiar rol (candidato+) |
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
| `POST /api/zones` | Crear zona (candidato+) |
| `PUT /api/zones/:id` | Actualizar zona |
| `DELETE /api/zones/:id` | Eliminar zona |
| **Org Hierarchy** | |
| `GET /api/org-hierarchy/campaign/:campaignId` | Arbol organizacional |
| `GET /api/org-hierarchy/campaign/:campaignId/subordinates/:userId` | Subordinados de un usuario |
| `POST /api/org-hierarchy` | Asignar relacion supervisor |
| `PUT /api/org-hierarchy/:id` | Actualizar nodo |
| `DELETE /api/org-hierarchy/:id` | Remover relacion |
| **Invitations** | |
| `POST /api/invitations` | Crear invitacion (candidato+) |
| `GET /api/invitations/campaign/:campaignId` | Listar invitaciones de campana |
| `DELETE /api/invitations/:id` | Revocar invitacion |
| **Access Requests** | |
| `GET /api/access-requests` | Listar solicitudes (candidato+) |
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
| `GET /api/cms/stream` | SSE eventos realtime del CMS |
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
| **Leads** | |
| `GET /api/leads` | Listar leads de campana |
| `POST /api/leads` | Crear lead |
| `PUT /api/leads/:id` | Actualizar lead |
| **Support** | |
| `POST /api/support` | Crear ticket de soporte |
| `GET /api/support` | Listar tickets (admin+) |
| **Validacion** | |
| `POST /api/validacion` | Submit de validacion |
| `GET /api/validacion` | Listar validaciones |
| **Voluntarios** | |
| `GET /api/voluntarios` | Listar voluntarios de campana |
| `POST /api/voluntarios` | Registrar voluntario |
| **Metrics / Ops** | |
| `GET /api/metrics` | Metricas operativas (admin) — latencias p50/p90/p95/p99 por ruta |

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

# === TWILIO (obligatorio si se usa CMS WA) ===
TWILIO_ENCRYPTION_KEY=<clave-para-cifrar-auth-tokens>

# === TELEGRAM (opcional, notificaciones leads) ===
TELEGRAM_BOT_TOKEN=<token-bot>
TELEGRAM_CHAT_ID=<chat-id>
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

---

## 10. Arquitectura del Backend (Detallada)

### 10.1 Composition Root

El backend arranca en dos archivos:

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/server.ts` | Bootstrap: lee env, conecta Redis + DB, llama `buildApp()`, hace listen |
| `src/app.ts` | Composition root: registra plugins Fastify + todos los modulos de rutas |
| `src/config/env.ts` | **Unica fuente de verdad** de variables de entorno — NUNCA leer `process.env` directamente en modulos |
| `src/db.ts` | Pool `pg.Pool` con SSL auto-detect — compartido por todos los repositorios |

### 10.2 Patron de Modulo (obligatorio)

Cada modulo en `src/modules/<nombre>/` sigue esta estructura:

```
src/modules/<nombre>/
  routes.ts          <- Handler HTTP delgado. Solo parsea body, llama service/repo, responde.
  repository.ts      <- Queries SQL directas con pg.Pool. Sin logica de negocio.
  schemas.ts         <- Validacion Zod de input externo. Definicion de todos los shapes.
  types.ts           <- Tipos TypeScript del modulo (opcional si son pocos).
  service.ts         <- Logica de negocio compleja (solo cuando existe). Ej: AuthService.
  write-behind-queue.ts <- Cola Redis Streams (SOLO en agents y forms).
```

**Regla clave:** Los handlers en `routes.ts` deben ser delgados. La logica va en `service.ts` o `repository.ts`.

**Ejemplo de handler bien escrito:**
```typescript
app.post("/api/cms/contacts/:id/claim", {
  preHandler: [app.authenticate, authorize({ requireCampaign: true })]
}, async (request, reply) => {
  const requestId = String(request.id);
  const parsed = claimSchema.safeParse(request.params);
  if (!parsed.success) {
    return reply.code(400).send(errorPayload(requestId, "VALIDATION_ERROR", ...));
  }
  const result = await repo.claimContact(parsed.data.id, authed.userId);
  return reply.code(200).send({ ok: true, request_id: requestId, ...result });
});
```

### 10.3 Capa de Infraestructura (`src/infra/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `auth.ts` | Decorator `app.authenticate`: resuelve Bearer header o cookie httpOnly, verifica JWT, decora request con `userId`, `userRole`, `campaignIds`, `campaignPerms` |
| `auth.ts` | Exporta `AUTH_COOKIE_NAMES`, `parseCookies()` — fuente de verdad de nombres de cookies |
| `authorize.ts` | Factory `authorize(options)`: RBAC por rol + campaign scope + permisos tierra/digital |
| `http.ts` | `errorPayload(requestId, code, message)` — helper para respuestas de error standard |
| `redis.ts` | Cliente Redis, Lua scripts (enqueue, rate-limit dual), helpers xReadGroup, xAutoClaim, DLQ |
| `metrics.ts` | Registry de latencias p50/p90/p95/p99 por ruta + ingest outcome latencies |
| `upstream.ts` | HTTP client con retry para llamadas a Tegola |
| `health-poller.ts` | Polling periodico de readiness (DB, Redis, Tegola) |
| `cms-events.ts` | EventEmitter para broadcast SSE del CMS por campaign_id |
| `crypto.ts` | Cifrado AES para auth_tokens de Twilio en DB |
| `telegram.ts` | Cliente Telegram para notificaciones de leads |

### 10.4 Modulos Registrados (22 total)

| Modulo | Prefijo API | Descripcion |
|--------|-------------|-------------|
| `health` | `/api/health`, `/api/ready` | Liveness + readiness |
| `auth` | `/api/auth/*`, `/api/users/*` | Login, register, refresh, tokens, roles |
| `campaigns` | `/api/campaigns/*`, `/api/candidates` | CRUD campanas + stats + members |
| `forms` | `/api/forms/*` | Formularios legacy (write-behind Redis Streams) |
| `form-submissions` | `/api/form-submissions/*` | Formularios nuevos (JSONB directo a DB) |
| `form-definitions` | `/api/form-definitions/*` | Definiciones de formularios |
| `agents` | `/api/agents/*`, `/ws/tracking` | Tracking GPS + WS bidireccional + SSE + history |
| `meets` | `/api/meets/*` | Reuniones de campo |
| `zones` | `/api/zones/*` | Zonas geograficas (centro + radio) |
| `org-hierarchy` | `/api/org-hierarchy/*` | Jerarquia organizacional |
| `invitations` | `/api/invitations/*` | Invitaciones por codigo |
| `access-requests` | `/api/access-requests/*` | Solicitudes de acceso |
| `map` | `/api/config`, `/api/tiles/*`, `/api/capabilities` | Proxy tiles MVT a Tegola |
| `uploads` | `/api/uploads/*` | Archivos |
| `analytics` | `/api/campaigns/:id/analytics`, `/api/analytics/*` | Datos GA4 por campana |
| `cms` | `/api/cms/*` | CMS contactos + SSE realtime |
| `objectives` | `/api/objectives/*` | Objetivos por zona y por usuario |
| `twilio` | `/api/twilio/*`, `/api/webhooks/twilio/*` | WhatsApp via Twilio |
| `leads` | `/api/leads/*` | Leads de campana con notificacion Telegram |
| `support` | `/api/support/*` | Tickets de soporte interno |
| `validacion` | `/api/validacion/*` | Validacion de datos de campo |
| `voluntarios` | `/api/voluntarios/*` | Registro de voluntarios |

**Ruta especial:** `GET /api/metrics` definida directamente en `app.ts` (no en un modulo).

### 10.5 Modelo de Roles (6 niveles)

| Rol | Nivel | Descripcion |
|-----|-------|-------------|
| `admin` | 50 | Acceso total al sistema |
| `consultor` | 40 | Consultores externos con acceso amplio |
| `candidato` | 30 | Candidato + gestion operativa de su campana |
| `brigadista_zonal` | 20 | Coordinadores de zona |
| `agente_campo` | 10 | Agentes de campo (mobile) |
| `agente_digital` | 10 | Operadores digitales (mismo nivel que campo) |

**Regla:** `authorize({ roles: ["candidato"] })` permite nivel 30+. Un rol con nivel >= al requerido pasa.
**Nota:** `jefe_campana` fue eliminado del sistema. El alias no existe en `ROLE_ALIASES`. Migraciones DB pendientes.

**Resolucion de rol efectivo:** Al hacer login, el backend computa el rol efectivo como el maximo entre el rol global del usuario y todos sus roles de campana. Un `agente_campo` con rol `consultor` en una campana obtiene nivel 40 en el JWT.

### 10.6 Autenticacion (Dual-Mode)

El backend sirve a **dos clientes** con mecanismos de auth distintos simultaneamente:

| Cliente | Transporte | Storage | Refresh |
|---------|-----------|---------|---------|
| **Web** (Next.js via Vercel proxy) | httpOnly cookie `goberna_access_token` | Cookie del browser | `POST /api/auth/refresh` — cookie va automaticamente |
| **Mobile** (Expo directo) | `Authorization: Bearer <token>` header | `expo-secure-store` | `POST /api/auth/refresh` con `{ refresh_token }` en body JSON |

**Resolucion de token en `src/infra/auth.ts`:**
```
1. Authorization: Bearer <token>  → si existe, usar (mobile/programmatic)
2. Cookie: goberna_access_token   → fallback (web via httpOnly cookie)
3. Si ninguno → 401 AUTH_TOKEN_MISSING
```

**Cookies seteadas por el backend (login + refresh):**

| Cookie | httpOnly | Path | Max-Age | Proposito |
|--------|----------|------|---------|-----------|
| `goberna_access_token` | Si | `/` | 31536000 (1 año) | JWT de acceso |
| `goberna_refresh_token` | Si | `/api/auth` | 31536000 (1 año) | JWT de refresh (scope restringido) |
| `goberna_session` | No | `/` | 31536000 (1 año) | Flag `"1"` — Next.js middleware detecta sesion sin leer JWT |

**Refresh token rotation:** Cada refresh revoca el token actual y emite uno nuevo en la misma familia. Si se detecta reutilizacion del mismo token, se revoca **toda la familia** (proteccion contra token reuse attacks).

**Reglas de seguridad (No Negociables):**
- **NUNCA** guardar tokens en localStorage/sessionStorage en la web
- **NUNCA** leer el JWT desde JavaScript en el browser (es httpOnly)
- El flag `goberna_session=1` es el unico indicador client-side de sesion activa
- En produccion, cookies llevan flag `Secure` (solo HTTPS) — controlado por `isProd` derivado de `env.nodeEnv`
- El refresh cookie tiene `Path=/api/auth` (scope restringido)
- En fallo de refresh, el backend **limpia todas las cookies** para evitar retry loops
- `setAuthCookies()` y `clearAuthCookies()` estan en `auth/routes.ts` — NO duplicar en otros modulos

### 10.7 Autorizacion RBAC (`src/infra/authorize.ts`)

```typescript
// Solo admins
preHandler: [app.authenticate, authorize({ roles: ["admin"] })]

// Candidato y arriba, scoped a una campana (campaign_id de header, param o body)
preHandler: [app.authenticate, authorize({ roles: ["candidato"], requireCampaign: true })]

// Requiere permiso tierra dentro de la campana
preHandler: [app.authenticate, authorize({ requirePermission: "tierra" })]
```

**Resolucion de campaign_id** (en orden de prioridad):
1. Header `x-campaign-id`
2. Route param `campaignId`
3. Body `campaign_id`

### 10.8 Ingesta Write-Behind (Redis Streams)

Los modulos `agents` y `forms` usan write-behind para ingesta de alta frecuencia:

```
Mobile/Field → POST /api/agents/location
                    |
                    ↓
          [Lua script atomico en Redis]
          Dedup por seq number (tracking)
          Dedup por idempotency key (forms)
                    |
                    ↓
          Redis Stream (XADD MAXLEN ~)
                    |
                    ↓
          Worker interno (xReadGroup) → batch flush → PostgreSQL
                    |
                    ↓ (si falla > STREAM_DLQ_MAX_ATTEMPTS)
          DLQ Stream (tracking:dlq / forms:dlq)
```

**Lua scripts en `src/infra/redis.ts`:**
- `trackingEnqueueScript` — dedup por seq number por agente (atomic HGET/HSET + XADD)
- `formsEnqueueScript` — dedup por idempotency key con TTL (atomic SET NX + XADD)
- `weightedRateLimitScript` — rate limit con costo variable (single actor)
- `dualWeightedRateLimitScript` — rate limit dual actor + IP (proteccion formularios)

### 10.9 CORS y Seguridad de Origenes

- En produccion, `FRONTEND_ORIGINS=*` **bloquea todas las requests** cross-origin (fail-safe)
- El backend loguea `.error()` al arrancar si detecta wildcard + produccion
- Siempre usar origenes explicitos en produccion: `FRONTEND_ORIGINS=https://dashboard.grupogoberna.com`
- `credentials: true` siempre activo (necesario para cookies)
- Chrome/Firefox extensions permitidas (`chrome-extension://`, `moz-extension://`)
- Pattern `https://*.vercel.app` soportado para preview deployments

---

## 11. Arquitectura Web (Next.js)

### 11.1 Estructura de Rutas

```
apps/web/app/
  (dashboard)/               <- Grupo de rutas protegidas (auth required)
    layout.tsx               <- Layout del dashboard
    page.tsx                 <- Home (map view)
    candidatos/              <- Gestion de campanas
    cms/                     <- CMS de contactos (SSE realtime)
    cms-metrics/             <- Metricas CMS global
    equipo/                  <- Gestion de equipo
    formularios/             <- Submissions de formularios
    map/                     <- Mapa interactivo + tracking live
    ops/                     <- Panel operativo (metricas p50/p90/p95/p99)
    settings/                <- Configuracion de campana
  (public)/                  <- Rutas publicas
  login/                     <- Login (email o telefono)
  register/                  <- Registro
  onboarding/                <- Onboarding de invitacion
  descargar/                 <- Landing de descarga de la app mobile
  extension/                 <- Extension de browser
```

### 11.2 Estructura de Codigo

```
apps/web/
  app/                       <- Next.js App Router
  lib/
    types/                   <- Definiciones TypeScript
    constants/               <- Valores estaticos
    utils/                   <- Funciones puras sin side-effects
    hooks/                   <- Custom React hooks
    services/                <- Capa de comunicacion con API
      api.ts                 <- Base API client (fetch + credentials: same-origin)
      campaigns.ts
      access-requests.ts
      cms.ts
      forms.ts
      geo.ts
      index.ts               <- Re-exports
    ui/                      <- Componentes presentacionales reutilizables
    auth-context.tsx         <- Auth state management
    query-provider.tsx       <- TanStack Query provider
  middleware.ts              <- Proteccion server-side de rutas (fail-closed)
  next.config.ts             <- Proxy rewrites /api/* y /uploads/*
  components/                <- shadcn/ui registry
  registry/                  <- Componentes registrados
```

### 11.3 Patron de Feature

```
app/(dashboard)/<feature>/
  _components/               <- Componentes propios del feature
    <component>.tsx
    index.ts                 <- Re-exports
  page.tsx                   <- Orquestador (~200 lineas max)
```

### 11.4 Proxy Next.js

```typescript
// next.config.ts
const target = process.env.BACKEND_PROXY_TARGET ?? "https://api.goberna.us";
// Rewrite /api/* → backend. Permite que las httpOnly cookies funcionen same-origin.
```

### 11.5 Middleware (fail-closed)

- Protege rutas server-side **ANTES** de renderizar contenido
- Rutas desconocidas = protegidas por defecto
- Rutas publicas explicitas: `/`, `/login`, `/register`, `/onboarding`, `/mapa`, `/descargar`, `/extension`
- Chequea cookie `goberna_session` — si no existe, redirect a `/login?from=<path>`
- Agrega security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy`

### 11.6 SSE (patron obligatorio para web)

Toda conexion SSE en el dashboard **DEBE**:

1. Usar `credentials: "same-origin"` en el `fetch()`
2. Manejar 401 intentando `POST /api/auth/refresh` una sola vez
3. Re-intentar la conexion SSE si el refresh tuvo exito
4. Reconectar con **backoff exponencial** (max 30s), NUNCA intervalo fijo
5. Implementaciones de referencia: `use-agent-sse.ts` (tracking) y `cms/page.tsx` (CMS)

---

## 12. Arquitectura Mobile (Expo)

### 12.1 Estructura

```
apps/mobile/
  app/
    _layout.tsx              <- Root layout con auth guard
    (auth)/                  <- Screens de login/registro
    (main)/                  <- Screens protegidas
    index.tsx                <- Entry redirect
  lib/
    api.ts                   <- API client con Bearer token
    auth-store.ts            <- Tokens en expo-secure-store
    app-context.tsx          <- Context global de la app
    tracking/                <- GPS foreground + background
    offline-queue/           <- Cola SQLite para offline-first
    types.ts, events.ts, utm.ts, constants/
  components/
  hooks/
  agents/                    <- Agentes internos de la app
```

### 12.2 Offline-First (expo-sqlite)

```
Usuario captura GPS/Form
        |
        ↓
SQLite local (inmediato, siempre funciona)
  - pending_locations
  - pending_forms
  - sync_meta
        |
        ↓ (Sync Service cada 30s, cuando hay red)
POST /api/agents/location (batch preferido)
POST /api/forms/batch
        |
        ↓
Backend: dedup → Redis Stream → PostgreSQL
        |
        ↓
Marca como synced en SQLite, limpia viejos
```

### 12.3 Auth Mobile

- Tokens almacenados en `expo-secure-store` (NO AsyncStorage)
- Refresh: `POST /api/auth/refresh` con `{ refresh_token }` en body JSON
- Respuesta del backend incluye tokens en body JSON Y setea cookies — mobile usa solo el JSON
- Login soporta email o telefono como identificador

---

## 13. Principios de Arquitectura (No Negociables)

1. **Offline-first siempre.** Peru tiene conectividad intermitente.
2. **Multi-tenant por campaign_id.** Todo aislado por campana.
3. **JSONB para formularios.** Estructura dinamica, no columnas fijas.
4. **Write-behind en Redis.** Ingesta rapida, persistencia eventual.
5. **Contratos explicitos.** Web/Mobile/Backend comparten semantica via este documento.
6. **Seguridad server-side.** Las apps son untrusted. JWT y campaign_id validados en backend.
7. **Config centralizada.** Usar `env` de `config/env.ts`, NUNCA `process.env` directamente en modulos.
8. **Handlers delgados.** Business logic en services/repositories, no en route handlers.
9. **Schema-first.** Validacion Zod en todo input externo antes de procesar.
10. **Errores seguros.** Sin leak de secretos, stack traces ni detalles internos al cliente.

---

## 14. Reglas de Herencia de AGENTS.md

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
    |   +-- /apps/web/app/AGENTS.md     <- Reglas de rutas
    |
    +-- /apps/mobile/AGENTS.md          <- Mobile Expo
```

**No deben existir** AGENTS.md individuales por modulo del backend (auth, campaigns, etc). Todo se consolida en `apps/backend/src/modules/AGENTS.md`.

---

## 15. Definition of Done (Global)

Cualquier cambio debe cumplir:

| App | Comando | Resultado |
|-----|---------|-----------|
| Backend | `bunx tsc --noEmit` | Sin errores |
| Web | `bun run build` | Build exitoso |
| Mobile | `bunx tsc --noEmit` | Sin errores |
| Produccion | `curl /api/health` | 200 OK |
| Produccion | `curl /api/ready` | 200 OK |

**Checklist adicional por cambio en backend:**
1. Mantener contrato backwards-compatible o versionar
2. Si cambia request/response de endpoint existente, actualizar seccion 6 de este archivo
3. Si se agrega modulo nuevo, agregarlo a seccion 10.4 de este archivo
4. Verificar que `/api/ready` sigue respondiendo 200
5. Si cambia ingesta, validar `ingest_outcome_latencies` en `/api/metrics`

---

## 16. Estado Actual Consolidado

> **IMPORTANTE:** Este estado manda sobre cualquier supuesto viejo en AGENTS.md locales.

1. Backend productivo activo en `apps/backend/` (22 modulos registrados en `app.ts`)
2. Web productivo activo en `apps/web/` (Vercel, Next.js 16.1)
3. Mobile en desarrollo en `apps/mobile/` (Expo SDK 54, RN 0.81)
4. Ingesta de tracking y forms con write-behind en Redis Streams + DLQ
5. Redis en produccion con politica `noeviction`
6. `AGENT_INGEST_TOKEN` obligatorio en produccion para tracking
7. `/api/metrics` expone latencias p50/p90/p95/p99 por ruta + ingest outcomes
8. Autenticacion dual-mode: cookies httpOnly (web) + Bearer tokens (mobile)
9. Next.js middleware fail-closed protege rutas del dashboard server-side
10. CORS bloqueado en produccion si `FRONTEND_ORIGINS=*` (fail-safe)
11. Login acepta email O telefono como identificador
12. Registro auto-acepta usuarios como `agente_campo` con `perm_tierra=true, perm_digital=true`
13. Refresh token rotation con deteccion de reuse attack (revocar familia completa)
14. `jefe_campana` eliminado del sistema de roles — migracion DB pendiente
15. `TWILIO_ENCRYPTION_KEY` obligatorio para usar el modulo CMS/WhatsApp
16. Soporte de notificaciones Telegram para leads (opcional, via `TELEGRAM_BOT_TOKEN`)

---

## 17. Reglas Operativas de Produccion

1. **Nunca** subir `.env` a git
2. **Nunca** exponer PostgreSQL ni Redis a internet
3. **Siempre** deploy via `docker compose` en `/srv/app`
4. **Siempre** deploy reproducible por script
5. **Siempre** rollback inmediato si falla deploy

---

## 18. Anti-patterns a Evitar

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
- Logica de negocio en route handlers (va en service.ts o repository.ts)
- Duplicar `parseCookies()` o `AUTH_COOKIE_NAMES` — importar de `infra/auth.ts`
- Exponer `tegolaBaseUrl` en respuestas de `/api/config` (URL interna de infra)
- Incluir IPs del VPS en `remotePatterns` de `next.config.ts` (leak de infra)
- Usar `jefe_campana` como rol en codigo nuevo (eliminado, usar `candidato`)
- Depender de `ROLE_ALIASES` para `jefe_campana` (el map esta vacio intencionalmente)

---

## 19. Prioridad de Decision

Cuando haya conflicto, decidir en este orden:

1. Disponibilidad del servicio
2. Seguridad basica
3. Recuperacion ante fallos
4. Simplicidad operativa para 2 devs
5. Optimizacion/performance

# AGENTS.md - Backend Fastify

> **Hereda de:** `/AGENTS.md` (root)  
> **Alcance:** Solo `apps/backend/**`  
> **Ultima actualizacion:** 2026-03-05

---

## Flujo de Desarrollo

Ver `/CONTRIBUTING.md` para el flujo GitHub Flow completo.  
Ver `/CMS_DEVELOPER_GUIDE.md` para guia tecnica del modulo CMS + Twilio.  
Ver seccion 9 del root `/AGENTS.md` para CI/CD y ramas.

---

## Contexto del Modulo

Backend API en Fastify 5.6 + TypeScript 5.9 + Bun.  
Ingesta critica por Redis Streams con write-behind y batch a PostgreSQL.  
CMS de contactos con SSE realtime. Integracion WhatsApp via Twilio.

---

## Rutas del Codigo

| Concepto | Ruta |
|----------|------|
| Bootstrap | `src/server.ts` |
| App composition | `src/app.ts` |
| Config/env | `src/config/env.ts` |
| DB connection | `src/db.ts` |
| Schema Drizzle | `src/schema.ts` |
| Contracts (types) | `src/contracts/` |
| Redis/Streams | `src/infra/redis.ts` |
| Metricas | `src/infra/metrics.ts` |
| Auth decorator | `src/infra/auth.ts` |
| Authorization | `src/infra/authorize.ts` |
| Crypto (Twilio) | `src/infra/crypto.ts` |
| HTTP helpers | `src/infra/http.ts` |
| Upstream (Tegola) | `src/infra/upstream.ts` |
| DB migrations | `src/infra/database/` |

### Modulos por dominio (23 modulos)
```
src/modules/
  health/           <- /api/health, /api/ready, /api/ops/system
  auth/             <- login, register, refresh, me, logout
  agents/           <- tracking GPS + location history + SSE + WS
  forms/            <- formularios legacy (write-behind queue)
  form-submissions/ <- formularios nuevos (JSONB directo)
  form-definitions/ <- definiciones de formularios
  campaigns/        <- campanas + stats + members + consultores + Twilio integration
  meets/            <- reuniones de campo
  zones/            <- zonas geograficas (centro + radio)
  org-hierarchy/    <- jerarquia organizacional
  invitations/      <- invitaciones por codigo
  access-requests/  <- solicitudes de acceso
  map/              <- proxy a Tegola (tiles MVT)
  uploads/          <- archivos
  analytics/        <- datos GA4 por campana
  cms/              <- CMS de contactos + SSE realtime
  objectives/       <- objetivos por zona y por usuario
  twilio/           <- WhatsApp via Twilio (send, webhook, history)
  leads/            <- leads de campana con notificacion Telegram
  support/          <- tickets de soporte interno + WebSocket bridge
  validacion/       <- validacion de datos de campo
  voluntarios/      <- registro de voluntarios
  regional-leaders/ <- registro de lideres regionales
```

---

## Reglas de Arquitectura

1. **Handlers delgados** - Negocio en modulo/infra, no en routes
2. **Schema-first** - Validacion Zod en todo ingreso externo
3. **Configurable** - Nada hardcodeado de timeout/retry/rate-limit; todo por env
4. **Backwards-compatible** - Contratos versionados si hay breaking change
5. **Errores seguros** - Deterministicos, sin leak de secretos
6. **Config centralizada** - Usar `env` de `config/env.ts`, NUNCA `process.env` directamente en modulos

---

## Convenciones de Modulo

Cada modulo sigue esta estructura:

| Archivo | Proposito |
|---------|-----------|
| `routes.ts` | Endpoints HTTP (handler delgado) |
| `repository.ts` o `store.ts` | Queries PostgreSQL/Redis |
| `schemas.ts` o `schema.ts` | Validacion Zod |
| `types.ts` | Tipos TypeScript (opcional) |
| `service.ts` | Logica de negocio (cuando es compleja) |
| `write-behind-queue.ts` | Cola Redis Streams (solo agents y forms) |

**Reglas entre modulos:**
- Sin dependencia circular entre modulos
- Endpoints y payloads explicitos; cero contratos implicitos
- Mantener contrato backwards-compatible o versionar
- Si cambia request/response, actualizar seccion 6 del root AGENTS.md

---

## Reglas Operativas

| Regla | Detalle |
|-------|---------|
| Auth tracking | `AGENT_INGEST_TOKEN` obligatorio en prod para `/api/agents/location` |
| Rate limit auth | Per-IP rate limit en login/register/refresh (`RATE_LIMIT_AUTH_PER_MINUTE`, default 10) |
| Rate limit forms | Dual actor + IP guardrail, configurable por env |
| Readiness | `/api/ready` valida DB + Tegola + Redis |
| Redis policy | Produccion en `noeviction` |
| Drift | Lo que corre en VPS sale de `main` + compose reproducible |
| Metricas | `/api/metrics` con `latencies` por ruta y `ingest_outcome_latencies` |
| Token cleanup | Cron periodico limpia `refresh_tokens` expirados (`REFRESH_TOKEN_CLEANUP_INTERVAL_MS`) |
| Location history | Append-only en `agent_location_history`, retention configurable (`LOCATION_HISTORY_RETENTION_DAYS`) |
| Permissions | `perm_tierra`/`perm_digital` en JWT como `campaign_perms` map, validado en `authorize()` |
| CMS SSE | Broadcast de eventos lock/unlock/hablado a clientes de la misma campana |
| Twilio | Webhook publico valida firma `X-Twilio-Signature` antes de procesar |
| CORS prod | Wildcard `*` bloqueado en produccion (fail-safe). Usar origenes explicitos. |
| Auth cookies | Login/refresh setean httpOnly cookies + session flag. Ver seccion 13.1 del root. |
| Refresh fail | Si refresh falla, `clearAuthCookies()` limpia cookies para evitar retry loops. |

## Seguridad Auth (Dual-Mode)

El backend soporta dos modos de auth simultaneamente (ver seccion 10.6 del root `/AGENTS.md`):

| Mecanismo | Cliente | Archivos clave |
|-----------|---------|----------------|
| `Authorization: Bearer` header | Mobile (Expo) | `src/infra/auth.ts` (resolucion) |
| httpOnly cookies (`goberna_access_token`) | Web (Next.js proxy) | `src/infra/auth.ts` (resolucion), `src/modules/auth/routes.ts` (set/clear) |

### Archivos de seguridad

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/infra/auth.ts` | Decorator `authenticate`: resuelve Bearer o cookie, verifica JWT, decora request |
| `src/infra/auth.ts` | Exporta `parseCookies()`, `AUTH_COOKIE_NAMES` (compartidos con auth routes) |
| `src/modules/auth/routes.ts` | `setAuthCookies()` y `clearAuthCookies()` — helpers para manejar cookies en login/refresh/logout |
| `src/app.ts` | CORS config con bloqueo de wildcard en produccion |

### Reglas al modificar auth

- **NUNCA** leer `process.env.NODE_ENV` directamente; usar `env.nodeEnv` del constructor
- **SIEMPRE** pasar `isProd` a `setAuthCookies()`/`clearAuthCookies()` (controla flag `Secure`)
- **SIEMPRE** limpiar cookies en catch de refresh (evita retry loops del browser)
- **SIEMPRE** reutilizar `parseCookies()` de `infra/auth.ts` (no regex ad-hoc)
- El endpoint `/api/auth/refresh` tiene rate limit per-IP igual que login
- `/api/config` NO debe exponer `tegolaBaseUrl` (URL interna de infraestructura)

## Modelo de Roles (6 niveles)

| Rol | Nivel | Descripcion |
|-----|-------|-------------|
| `admin` | 50 | Acceso total al sistema |
| `consultor` | 40 | Consultores externos con acceso amplio |
| `candidato` | 30 | Candidato + gestion operativa de su campana |
| `brigadista_zonal` | 20 | Coordinadores de zona |
| `agente_campo` | 10 | Agentes de campo (mobile) |
| `agente_digital` | 10 | Operadores digitales (mismo nivel que campo) |

Jerarquia: un rol con nivel >= al requerido pasa el check.

**IMPORTANTE:** `jefe_campana` fue eliminado del sistema. No usar en codigo nuevo. `ROLE_ALIASES` esta vacio intencionalmente. `candidato` es un rol de primera clase (nivel 30), no un alias.

---

## Desarrollo Local

### Setup
```bash
cd apps/backend
bun install
cp ../../.env.example .env  # Editar con valores locales
```

### .env minimo local
```bash
DATABASE_URL=postgresql://appuser:password@localhost:5432/appdb
REDIS_URL=redis://localhost:6379
JWT_SECRET=development-secret-min-32-characters-long
AGENT_INGEST_TOKEN=dev-token
PORT=3001
LOG_LEVEL=debug
TEGOLA_BASE_URL=http://localhost:8080
```

### Comandos
```bash
bun run dev      # Desarrollo con watch
bun run migrate  # Correr migraciones
bun run seed     # Crear datos de prueba
```

---

## Definition of Done (Backend)

1. `bunx tsc --noEmit` en verde
2. Smoke test:
   - `curl http://localhost:3001/api/health` -> 200
   - `curl http://localhost:3001/api/ready` -> 200
   - `curl http://localhost:3001/api/agents/health` -> 200
3. Si cambia contrato, actualizar seccion 6 del root `/AGENTS.md`

---

## Comunicacion con Otros Modulos

| Modulo | Como se comunica |
|--------|------------------|
| Web (`apps/web`) | Consume API via proxy `/api/*` en `https://dashboard.grupogoberna.com` |
| Mobile (`apps/mobile`) | Consume API directo `https://api.goberna.us/api` |
| DB | PostgreSQL via `DATABASE_URL` |
| Cache | Redis via `REDIS_URL` + `REDIS_PASSWORD` |
| Tiles | Tegola via `TEGOLA_BASE_URL` |

---

## Contratos que Expone

Ver seccion 6 del root `/AGENTS.md` para lista completa de endpoints.

### Response Standard
```typescript
// Success
{ ok: true, request_id: string, ...data }

// Error
{ ok: false, request_id: string, code: string, message: string }
```

### Codigos de Error
- `VALIDATION_ERROR` - Schema invalido
- `AUTH_INVALID_CREDENTIALS` - Login fallido
- `AUTH_TOKEN_EXPIRED` - JWT vencido
- `AUTH_UNAUTHORIZED` - Sin permiso
- `AUTHZ_CAMPAIGN_DENIED` - Sin acceso a campana
- `RATE_LIMITED` - Demasiadas requests
- `NOT_FOUND` - Recurso no existe
- `UPSTREAM_ERROR` - Error de servicio externo
- `ALREADY_CLAIMED` - Contacto CMS ya tomado
- `TWILIO_SEND_ERROR` - Error enviando WhatsApp
- `MISSING_CAMPAIGN` - Falta campaign_id

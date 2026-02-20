# AGENTS.md - Backend Fastify

> **Hereda de:** `/AGENTS.md` (root)  
> **Alcance:** Solo `apps/backend/**`  
> **Ultima actualizacion:** 2026-02-20

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

### Modulos por dominio (18 modulos)
```
src/modules/
  health/           <- /api/health, /api/ready, /api/ops/system
  auth/             <- login, register, refresh, me, logout
  agents/           <- tracking GPS + location history + SSE
  forms/            <- formularios legacy (write-behind queue)
  form-submissions/ <- formularios nuevos (JSONB directo)
  form-definitions/ <- definiciones de formularios
  campaigns/        <- configuracion de campanas + stats + members
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
```

---

## Reglas de Arquitectura

1. **Handlers delgados** - Negocio en modulo/infra, no en routes
2. **Schema-first** - Validacion Zod en todo ingreso externo
3. **Configurable** - Nada hardcodeado de timeout/retry/rate-limit; todo por env
4. **Backwards-compatible** - Contratos versionados si hay breaking change
5. **Errores seguros** - Deterministicos, sin leak de secretos

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
| Rate limit auth | Per-IP rate limit en login/register (`RATE_LIMIT_AUTH_PER_MINUTE`, default 10) |
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

## Modelo de Roles (5 niveles)

| Rol | Nivel | Descripcion |
|-----|-------|-------------|
| `admin` | 50 | Acceso total al sistema |
| `consultor` | 40 | Consultores externos con acceso amplio |
| `jefe_campana` | 30 | Jefes de campana, gestion operativa |
| `brigadista_zonal` | 20 | Coordinadores de zona |
| `agente_campo` | 10 | Agentes de campo (mobile) |

Jerarquia: un rol con nivel >= al requerido pasa el check.

**Nota:** Algunos endpoints usan rol `candidato` como alias — equivale a nivel entre `jefe_campana` y `consultor` en el sistema de permisos.

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

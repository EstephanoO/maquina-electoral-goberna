# AGENTS.md - Backend Fastify

> **Hereda de:** `/AGENTS.md` (root)  
> **Alcance:** Solo `apps/backend/**`

---

## Contexto del Modulo

Backend API en Fastify + TypeScript + Bun.  
Ingesta critica por Redis Streams con write-behind y batch a PostgreSQL.

---

## Rutas del Codigo

| Concepto | Ruta |
|----------|------|
| Bootstrap | `src/server.ts` |
| App composition | `src/app.ts` |
| Config/env | `src/config/env.ts` |
| DB connection | `src/db.ts` |
| Schema Drizzle | `src/schema.ts` |
| Redis/Streams | `src/infra/redis.ts` |
| Metricas | `src/infra/metrics.ts` |
| Auth decorator | `src/infra/auth.ts` |

### Modulos por dominio
```
src/modules/
  health/           <- /api/health, /api/ready, /api/system
  auth/             <- login, register, refresh, me, logout
  agents/           <- tracking GPS + location history
  forms/            <- formularios legacy (write-behind queue)
  form-submissions/ <- formularios nuevos (JSONB directo)
  form-definitions/ <- definiciones de formularios
  campaigns/        <- configuracion de campanas + stats
  meets/            <- reuniones de campo (enhanced)
  zones/            <- zonas geograficas (centro + radio)
  org-hierarchy/    <- jerarquia organizacional
  invitations/      <- invitaciones por codigo
  access-requests/  <- solicitudes de acceso
  map/              <- proxy a Tegola
  uploads/          <- archivos
```

---

## Reglas de Arquitectura

1. **Handlers delgados** - Negocio en modulo/infra, no en routes
2. **Schema-first** - Validacion Zod en todo ingreso externo
3. **Configurable** - Nada hardcodeado de timeout/retry/rate-limit; todo por env
4. **Backwards-compatible** - Contratos versionados si hay breaking change
5. **Errores seguros** - Deterministicos, sin leak de secretos

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

## Modelo de Roles (5 niveles)

| Rol | Nivel | Descripcion |
|-----|-------|-------------|
| `admin` | 50 | Acceso total al sistema |
| `consultor` | 40 | Consultores externos con acceso amplio |
| `jefe_campana` | 30 | Jefes de campana, gestion operativa |
| `brigadista_zonal` | 20 | Coordinadores de zona |
| `agente_campo` | 10 | Agentes de campo (mobile) |

Jerarquia: un rol con nivel >= al requerido pasa el check.

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
3. Si cambia contrato, actualizar docs compartidos

---

## Comunicacion con Otros Modulos

| Modulo | Como se comunica |
|--------|------------------|
| Web (`apps/web`) | Consume API via proxy `/api/*` |
| Mobile (`apps/mobile`) | Consume API directo `http://161.132.39.165/api` |
| DB | PostgreSQL via `DATABASE_URL` |
| Cache | Redis via `REDIS_URL` |
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
- `RATE_LIMITED` - Demasiadas requests
- `NOT_FOUND` - Recurso no existe
- `UPSTREAM_ERROR` - Error de servicio externo

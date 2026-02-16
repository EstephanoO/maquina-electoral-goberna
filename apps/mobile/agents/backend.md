# Backend API - Contexto de Dominio

> **Prerequisito:** Lee [`AGENTS.md`](../AGENTS.md) primero. Este archivo extiende el contexto global con reglas especificas del backend.

---

## Identidad

**Repo:** `goberna-backend` (por crear, separado del repo Expo)
**Proposito:** API REST para operacion territorial. Auth, campanas, formularios, tracking, zonas, WhatsApp.
**Runtime:** Node.js + Fastify + TypeScript strict
**Base de Datos:** PostgreSQL + PostGIS
**Estado:** No creado. Este documento define la arquitectura target.

---

## Arquitectura: Screaming Architecture

```
goberna-backend/
  src/
    auth/                    # Dominio: Autenticacion
      auth.routes.ts         # POST /auth/login, /auth/refresh, /auth/logout
      auth.handlers.ts       # Request/Response handlers
      auth.service.ts        # Logica de negocio (hash, tokens)
      auth.repository.ts     # Queries a DB
      auth.schemas.ts        # Validacion Zod/TypeBox
      auth.errors.ts         # Errores de dominio
      __tests__/

    campaigns/               # Dominio: Campanas (multi-tenant core)
      campaigns.routes.ts
      campaigns.handlers.ts
      campaigns.service.ts
      campaigns.repository.ts
      campaigns.schemas.ts
      __tests__/

    forms/                   # Dominio: Formularios + submissions
      forms.routes.ts
      forms.handlers.ts
      forms.service.ts
      forms.repository.ts
      forms.schemas.ts
      __tests__/

    zones/                   # Dominio: Zonas geograficas
      zones.routes.ts
      zones.handlers.ts
      zones.service.ts
      zones.repository.ts
      __tests__/

    agents/                  # Dominio: Agentes de campo
      agents.routes.ts
      agents.handlers.ts
      agents.service.ts
      agents.repository.ts
      __tests__/

    tracking/                # Dominio: GPS tracking ingest
      tracking.routes.ts
      tracking.handlers.ts
      tracking.service.ts
      tracking.repository.ts
      __tests__/

    whatsapp/                # Futuro: CMS WhatsApp
    analytics/               # Futuro: Dashboards + metricas

    shared/                  # Compartido entre dominios
      middleware/
        auth.middleware.ts       # JWT verification
        campaign-guard.ts        # Verifica campaign_id en cada request
        rate-limit.middleware.ts  # Rate limiting dual actor+IP
      plugins/
        database.ts              # Plugin Fastify para PostgreSQL pool
        jwt.ts                   # Plugin para JWT sign/verify
      errors/
        app-error.ts             # Clase base de errores
        error-handler.ts         # Fastify error handler global
      types/
        index.ts                 # Tipos compartidos

  migrations/                # SQL versionadas
    001_initial_schema.sql
    002_auth_tables.sql
    ...

  config/
    index.ts                 # Lee .env, valida, exporta config tipada
    database.ts              # Connection string, pool config

  server.ts                  # Entry point: crea Fastify, registra plugins y rutas
  package.json
  tsconfig.json
  .env.example
```

---

## Skills Asignados

Cargar estos skills antes de implementar en este dominio:

| Skill | Cuando cargarlo |
|-------|----------------|
| `fastify` | Plugins, hooks, schemas, decorators, lifecycle de Fastify |
| `nodejs-backend-patterns` | Middleware, error handling, layered architecture |
| `postgresql-database-engineering` | Queries, indices, migraciones, PostGIS, JSONB, performance |
| `api-security-best-practices` | JWT, rate limiting, CORS, input validation, multi-tenant |
| `architecture-patterns` | Clean/Screaming Architecture, DDD, separation of concerns |
| `tdd-full-coverage` | Escribir tests, TDD workflow, coverage |

Skills de workflow (transversales):
- `brainstorming` -> antes de cualquier feature nueva
- `writing-plans` -> para crear plan de implementacion
- `executing-plans` -> para ejecutar un plan escrito

---

## Principios de Diseno (Backend)

1. **Un handler no toca la DB directamente.** Handler -> Service -> Repository.
2. **Validacion en el borde.** Schemas validan payload en el handler, antes de llegar al service.
3. **Errores tipados.** Cada dominio define sus errores. El error handler global los mapea a HTTP.
4. **Multi-tenant en middleware.** `campaign-guard` inyecta y valida campaign_id en cada request autenticado.
5. **No ORMs.** SQL directo con `pg` pool. Queries explicitas en repositories.
6. **Migraciones SQL manuales.** Archivos numerados, ejecutados en orden. No usar Prisma/Knex/etc.
7. **Tests por dominio.** Cada dominio tiene su `__tests__/`. Unit tests para services, integration tests para repositories.

---

## Schema de Base de Datos (Fase 1: Auth)

```sql
-- Campanas (multi-tenant root)
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'archived')) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Usuarios (agentes de campo)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('agent', 'supervisor', 'admin')) DEFAULT 'agent',
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'pending')) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Relacion usuario-campana (multi-tenant access)
CREATE TABLE user_campaigns (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('agent', 'supervisor', 'admin')) DEFAULT 'agent',
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')) DEFAULT 'active',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, campaign_id)
);

-- Refresh tokens (rotacion)
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_user_campaigns_user ON user_campaigns(user_id);
CREATE INDEX idx_user_campaigns_campaign ON user_campaigns(campaign_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
```

---

## Auth: Email + Password (Fase 1)

### Flujo Login
```
POST /auth/login
Body: { email, password }

1. Buscar user por email
2. Verificar password con bcrypt
3. Cargar campaigns activas del user
4. Generar access_token JWT (15min)
5. Generar refresh_token (7 dias), hashear, guardar en DB
6. Responder: { access_token, refresh_token, user, campaigns }
```

### Flujo Refresh
```
POST /auth/refresh
Body: { refresh_token }

1. Hashear token recibido
2. Buscar en DB por hash
3. Verificar no expirado ni revocado
4. Revocar token actual (rotacion)
5. Generar nuevo access_token + refresh_token
6. Responder: { access_token, refresh_token }
```

### Flujo Logout
```
POST /auth/logout
Header: Authorization: Bearer <access_token>

1. Validar JWT
2. Revocar todos los refresh_tokens del user
3. Responder: 204
```

### JWT Claims
```json
{
  "sub": "user-uuid",
  "email": "agente@example.com",
  "role": "agent",
  "campaign_ids": ["camp-uuid-1"],
  "iat": 1234567890,
  "exp": 1234568790
}
```

---

## Semantica de Errores (Compartida con Expo)

Todas las respuestas de error siguen este formato:

```json
{
  "code": "AUTH_INVALID_CREDENTIALS",
  "message": "Email o password incorrectos"
}
```

### Codigos de Error Auth
| Codigo | HTTP | Significado |
|--------|------|-------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Email o password incorrectos |
| `AUTH_TOKEN_EXPIRED` | 401 | Access token expirado |
| `AUTH_TOKEN_INVALID` | 401 | Token malformado o firma invalida |
| `AUTH_REFRESH_EXPIRED` | 401 | Refresh token expirado |
| `AUTH_REFRESH_REVOKED` | 401 | Refresh token ya fue usado (rotacion) |
| `AUTH_USER_SUSPENDED` | 403 | Usuario suspendido por admin |
| `AUTH_NO_CAMPAIGN_ACCESS` | 403 | User no tiene acceso a esa campana |
| `VALIDATION_ERROR` | 400 | Payload no cumple schema |
| `RATE_LIMITED` | 429 | Demasiados requests |
| `SERVER_ERROR` | 500 | Error interno |

---

## Rate Limiting

### Estrategia Dual (Actor + IP)
```
Auth endpoints (/auth/login):
  - Por IP: 5 intentos / 15min
  - Por email: 10 intentos / 15min (prevenir brute-force)

Business endpoints:
  - Por actor (x-agent-id o user_id): 100 req/min
  - Por IP (guardrail): 200 req/min
```

---

## Middleware de Campaign Guard

En CADA endpoint de negocio (forms, tracking, zonas, etc):

```
1. Extraer user_id del JWT
2. Extraer campaign_id del path o body
3. Buscar en user_campaigns WHERE user_id AND campaign_id AND status='active'
4. Si no existe -> 403 AUTH_NO_CAMPAIGN_ACCESS
5. Inyectar campaign context en request
```

Nunca confiar en campaign_id enviado por el cliente sin verificar acceso.

---

## Conexion con Expo App

Lee [`agents/expo-app.md`](expo-app.md) para el contexto de la app.

### Lo que el backend provee a la app (target)
```json
// POST /auth/login response
{
  "access_token": "eyJ...",
  "refresh_token": "rt_...",
  "user": {
    "id": "uuid",
    "email": "agente@example.com",
    "full_name": "Juan Perez",
    "role": "agent"
  },
  "campaigns": [
    {
      "id": "uuid",
      "name": "Lima Norte 2026",
      "slug": "lima-norte-2026",
      "config": {
        "modules": ["survey", "tracking"],
        "form_version": 3
      }
    }
  ]
}
```

### Contrato de Errores
La app debe manejar estos codigos sin ambiguedad:
- `401` -> Intentar refresh. Si refresh falla -> login screen.
- `403` -> Mostrar mensaje "Sin acceso". No reintentar.
- `429` -> Retry con backoff (ya implementado en app).
- `400` -> Mostrar error de validacion. No reintentar.
- `503` -> Retry con backoff (ya implementado en app).

---

## Dependencias (Target)

| Paquete | Para que |
|---------|----------|
| `fastify` | Framework HTTP |
| `@fastify/cors` | CORS para admin web |
| `@fastify/rate-limit` | Rate limiting |
| `pg` | PostgreSQL driver (pool) |
| `bcryptjs` | Hash de passwords |
| `jsonwebtoken` | JWT sign/verify |
| `zod` o `@sinclair/typebox` | Validacion de schemas |
| `dotenv` | Variables de entorno |
| `pino` | Logging (viene con Fastify) |

### NO usar
- ORMs (Prisma, TypeORM, Sequelize) -> SQL directo
- Express -> Fastify
- Knex -> Migraciones SQL manuales
- Auth libraries (Passport, NextAuth) -> JWT manual

---

## Fases de Implementacion

### Fase 1: Auth (INMEDIATA)
- Setup Fastify + TypeScript + tests
- PostgreSQL con tablas auth (users, campaigns, user_campaigns, refresh_tokens)
- POST /auth/login (email + password)
- POST /auth/refresh (rotacion)
- POST /auth/logout
- Middleware JWT
- Middleware campaign guard
- Tests completos

### Fase 2: Forms + Tracking (despues de Fase 1)
- Migrar endpoints de Vercel actual a Fastify
- Agregar campaign_id a todo
- JSONB para submissions
- PostGIS para tracking

### Fase 3: Zonas + Config
- CRUD zonas con GeoJSON
- Config de campana (modulos, forms, limites)
- Endpoint /campaigns/:id/config para app

### Fase 4: Analytics + Dashboard
- Conteos por zona/agente/campana
- Cache Redis para metricas
- Endpoints para admin web

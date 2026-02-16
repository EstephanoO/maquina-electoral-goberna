# Goberna - Arquitectura de Modulos

> Este documento define cómo los módulos se conectan entre Web, Mobile y Backend.  
> Es la referencia central para entender el flujo de datos del sistema.

**Documentos relacionados:**
- [DEPLOY.md](./DEPLOY.md) - Guía completa de deploy para VPS, Vercel y Expo
- [Root AGENTS.md](../AGENTS.md) - Fuente de verdad del proyecto

---

## Diagrama de Conexiones

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GOBERNA PLATFORM                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐        │
│  │   MOBILE     │         │     WEB      │         │   BACKEND    │        │
│  │  (Expo App)  │         │  (Next.js)   │         │  (Fastify)   │        │
│  └──────┬───────┘         └──────┬───────┘         └──────┬───────┘        │
│         │                        │                        │                 │
│         │    HTTP/JSON           │    Proxy /api/*        │                 │
│         └────────────────────────┼────────────────────────┤                 │
│                                  │                        │                 │
│                                  ▼                        ▼                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         API CONTRACTS                                │   │
│  ├─────────────┬─────────────┬─────────────┬─────────────┬─────────────┤   │
│  │    AUTH     │  TRACKING   │    FORMS    │     MAP     │  CAMPAIGNS  │   │
│  │  /api/auth  │ /api/agents │  /api/forms │  /api/tiles │/api/campaigns│  │
│  └─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘   │
│         │                        │                        │                 │
│         ▼                        ▼                        ▼                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         INFRASTRUCTURE                               │   │
│  ├───────────────────┬───────────────────┬─────────────────────────────┤   │
│  │    PostgreSQL     │      Redis        │        Tegola               │   │
│  │    + PostGIS      │    (Streams)      │     (MVT Tiles)             │   │
│  └───────────────────┴───────────────────┴─────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Modulos del Sistema

| Modulo | Backend | Web | Mobile | Descripcion |
|--------|---------|-----|--------|-------------|
| **Auth** | `src/modules/auth/` | `lib/auth-context.tsx` | `lib/auth-store.ts` | Autenticacion JWT |
| **Tracking** | `src/modules/agents/` | `app/(dashboard)/map/` | `lib/tracking/` | GPS en tiempo real |
| **Forms** | `src/modules/forms/` | `app/(dashboard)/formularios/` | `app/(main)/forms/` | Encuestas dinamicas |
| **Map** | `src/modules/map/` | `app/(dashboard)/map/` | (futuro) | Tiles vectoriales |
| **Campaigns** | `src/modules/campaigns/` | `app/(dashboard)/` | `lib/app-context.tsx` | Config multi-tenant |

---

## Flujos de Datos por Modulo

### 1. AUTH - Autenticacion

```
MOBILE                          BACKEND                         WEB
──────                          ───────                         ───
                                                                
login.tsx ──POST /auth/login──► routes.ts                      login/page.tsx
    │                              │                                │
    │                         service.ts                            │
    │                         (bcrypt verify)                       │
    │                              │                                │
    │                         repository.ts                         │
    │                         (users table)                         │
    │                              │                                │
    ◄──── JWT + user + campaigns ──┘                                │
    │                                                               │
auth-store.ts                                              auth-context.tsx
(SecureStore)                                              (localStorage)
    │                                                               │
    └─────────────── Bearer token en cada request ──────────────────┘
```

### 2. TRACKING - GPS en Tiempo Real

```
MOBILE                          BACKEND                         WEB
──────                          ───────                         ───
                                                                
tracking/service.ts            routes.ts                    map/page.tsx
    │                              │                            │
    │ POST /agents/location        │                            │
    │ (x-agent-token)              │                            │
    └─────────────────────────────►│                            │
                                   │                            │
                              store.ts                          │
                              (Redis live state)                │
                                   │                            │
                              write-behind-queue.ts             │
                              (Redis Stream)                    │
                                   │                            │
                              repository.ts ───► PostgreSQL     │
                                   │                            │
                                   │ GET /agents/stream (SSE)   │
                                   │◄───────────────────────────┤
                                   │                            │
                                   └─── Server-Sent Events ────►│
                                        (posiciones live)   useAgents.ts
```

### 3. FORMS - Formularios Dinamicos

```
MOBILE                          BACKEND                         WEB
──────                          ───────                         ───
                                                                
app/(main)/forms/              routes.ts                  formularios/page.tsx
    │                              │                            │
    │ GET /form-definitions/active │                            │
    │◄─────────────────────────────┤                            │
    │                              │                            │
form-renderer.tsx                  │                     (admin: ver submissions)
    │                              │                            │
    │ (usuario llena form)         │                            │
    │                              │                            │
    │ POST /forms                  │                            │
    │ (offline queue primero)      │                            │
    └─────────────────────────────►│                            │
                                   │                            │
                              schema.ts (validacion)            │
                                   │                            │
                              write-behind-queue.ts             │
                              (Redis Stream)                    │
                                   │                            │
                              repository.ts ───► PostgreSQL     │
                                   │              (JSONB)       │
                                   │                            │
                                   │ GET /forms (admin)         │
                                   │◄───────────────────────────┤
```

### 4. MAP - Tiles Vectoriales

```
MOBILE                          BACKEND                         WEB
──────                          ───────                         ───
                                                                
(futuro: MapLibre)             routes.ts                   map/page.tsx
                                   │                            │
                                   │ GET /api/config            │
                                   │◄───────────────────────────┤
                                   │                            │
                              tiles.ts                     MapLibre GL
                                   │                            │
                                   │ GET /tiles/:z/:x/:y.pbf    │
                              ┌────┴────┐                       │
                              ▼         │                       │
                           Tegola       │                       │
                           (proxy)      │                       │
                              │         │                       │
                              └─────────┼──────────────────────►│
                                   MVT tiles              (render en canvas)
```

### 5. CAMPAIGNS - Multi-tenant

```
MOBILE                          BACKEND                         WEB
──────                          ───────                         ───
                                                                
app-context.tsx                routes.ts               (dashboard)/layout.tsx
    │                              │                            │
    │ (campaign activa             │                            │
    │  en header)                  │                            │
    │                              │                            │
    │ x-campaign-id: xxx           │     x-campaign-id: xxx     │
    └─────────────────────────────►│◄───────────────────────────┤
                                   │                            │
                              middleware                        │
                              (valida pertenencia)              │
                                   │                            │
                              repository.ts                     │
                              (filtra por campaign_id)          │
```

---

## Archivos Clave por App

### Backend (`apps/backend/`)
```
src/
  app.ts                 # Composicion de la app
  server.ts              # Bootstrap
  config/env.ts          # Variables de entorno
  db.ts                  # Pool PostgreSQL
  schema.ts              # Schema Drizzle
  infra/
    auth.ts              # Decorator JWT
    redis.ts             # Cliente Redis
    metrics.ts           # Metricas
  modules/
    auth/                # Autenticacion
    agents/              # Tracking GPS
    forms/               # Formularios
    map/                 # Tiles
    campaigns/           # Multi-tenant
```

### Web (`apps/web/`)
```
app/
  (dashboard)/
    layout.tsx           # Shell con sidebar + auth check
    map/page.tsx         # Mapa con tracking
    formularios/         # Admin de forms
    ops/page.tsx         # Metricas operativas
  login/page.tsx         # Login
lib/
  api-client.ts          # Cliente HTTP con auto-refresh
  auth-context.tsx       # Estado de auth global
```

### Mobile (`apps/mobile/`)
```
app/
  (auth)/
    login.tsx            # Login
    register.tsx         # Registro
  (main)/
    _layout.tsx          # Tabs principales
    forms/               # Formularios de campo
lib/
  api.ts                 # Cliente HTTP
  auth-store.ts          # SecureStore para tokens
  tracking/              # Servicio GPS background
  app-context.tsx        # Campaign activa
```

---

## Contratos Compartidos

Todos los endpoints retornan:

```typescript
// Success
{
  ok: true,
  request_id: string,
  ...data
}

// Error
{
  ok: false,
  request_id: string,
  code: string,      // AUTH_INVALID_CREDENTIALS, VALIDATION_ERROR, etc.
  message: string
}
```

### Codigos de Error Comunes

| Codigo | HTTP | Descripcion |
|--------|------|-------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Login fallido |
| `AUTH_TOKEN_EXPIRED` | 401 | JWT vencido |
| `AUTH_UNAUTHORIZED` | 403 | Sin permiso |
| `VALIDATION_ERROR` | 400 | Schema invalido |
| `RATE_LIMITED` | 429 | Demasiadas requests |
| `NOT_FOUND` | 404 | Recurso no existe |

---

## Headers Requeridos

| Header | Donde | Descripcion |
|--------|-------|-------------|
| `Authorization: Bearer <jwt>` | Endpoints autenticados | Token de acceso |
| `x-campaign-id: <uuid>` | Endpoints con scope de campana | Campana activa |
| `x-agent-token: <token>` | `/api/agents/location` | Token fijo de tracking |
| `Content-Type: application/json` | Todos | Formato de body |

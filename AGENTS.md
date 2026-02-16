# AGENTS.md - Goberna Platform (Root Source of Truth)

> **Regla #1:** Este archivo es la fuente de verdad absoluta del monorepo. Los AGENTS.md de cada app heredan de este. Si hay conflicto, este archivo prevalece.

---

## 1. Identidad del Producto

**Goberna** es una plataforma SaaS de operacion territorial para campanas politicas en Peru.

| Aspecto | Detalle |
|---------|---------|
| Organizacion | Grupo Goberna |
| Mercado | Peru (conectividad intermitente, campo operativo real) |
| Diferenciador | Offline-first, mapas vectoriales, CRM integrado, multi-campana |
| Equipo | 2 devs |
| Prioridad | Operabilidad > Sofisticacion |

---

## 2. Estructura del Monorepo

```
nexus6.0/
  AGENTS.md                    <- Este archivo (root, fuente de verdad)
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

---

## 4. Stack Tecnologico (Estado Actual)

| Capa | Tecnologia | Ubicacion | Estado |
|------|-----------|-----------|--------|
| Backend API | Fastify + TypeScript + Bun | `apps/backend/` | **Produccion** |
| Base de Datos | PostgreSQL 15 + PostGIS | Docker VPS | **Produccion** |
| Cache/Queues | Redis 7.4 (Streams) | Docker VPS | **Produccion** |
| Vector Tiles | Tegola | Docker VPS | **Produccion** |
| Web Admin | Next.js 16 + React 19 | `apps/web/` | **Produccion** (Vercel) |
| Mobile App | Expo SDK 54 + RN 0.81 | `apps/mobile/` | **Desarrollo** |
| CI/CD | GitHub Actions | `.github/workflows/` | **Produccion** |

---

## 5. Infraestructura de Produccion

| Recurso | Valor |
|---------|-------|
| VPS Host | `161.132.39.165` |
| VPS RAM | 32GB |
| SSH User | `deploy` |
| Project Dir | `/srv/app` |
| Timezone | `America/Lima` |
| Frontend | Vercel (maquina-electoral-goberna-web) |
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

### Endpoints Autenticados (JWT Bearer)
| Endpoint | Descripcion |
|----------|-------------|
| `GET /api/auth/me` | Perfil + campanas del usuario |
| `POST /api/auth/refresh` | Renovar tokens |
| `POST /api/auth/logout` | Cerrar sesion |
| `GET /api/campaigns/:id` | Config de campana |
| `GET /api/form-definitions/active` | Formularios activos |
| `POST /api/forms` | Submit formulario |
| `POST /api/forms/batch` | Submit batch de formularios |
| `GET /api/metrics` | Metricas operativas (admin) |

### Endpoints de Tracking (x-agent-token)
| Endpoint | Descripcion |
|----------|-------------|
| `POST /api/agents/location` | Enviar ubicacion |
| `GET /api/agents/live` | Posiciones actuales |
| `GET /api/agents/stream` | SSE de posiciones |
| `GET /api/agents/health` | Health del tracking |

---

## 7. Variables de Entorno por App

### Backend (`apps/backend/.env`)
```bash
# === OBLIGATORIAS ===
DATABASE_URL=postgresql://user:pass@localhost:5432/db
REDIS_URL=redis://localhost:6379
JWT_SECRET=<minimo-32-caracteres>
AGENT_INGEST_TOKEN=<token-para-tracking>

# === OPCIONALES (con defaults) ===
PORT=3001
LOG_LEVEL=info
TEGOLA_BASE_URL=http://localhost:8080
```

### Web (`apps/web/.env.local`)
```bash
# Desarrollo local
BACKEND_PROXY_TARGET=http://localhost:3001

# Produccion (en Vercel env vars)
# BACKEND_PROXY_TARGET=http://161.132.39.165
```

### Mobile (`apps/mobile/app.json` > extra)
```json
{
  "EXPO_PUBLIC_BACKEND_API_URL": "http://161.132.39.165/api",
  "EXPO_PUBLIC_AGENT_INGEST_TOKEN": "<token>"
}
```

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
curl http://161.132.39.165/api/health
```

---

## 9. Principios de Arquitectura (No Negociables)

1. **Offline-first siempre.** Peru tiene conectividad intermitente.
2. **Multi-tenant por campaign_id.** Todo aislado por campana.
3. **JSONB para formularios.** Estructura dinamica, no columnas fijas.
4. **Write-behind en Redis.** Ingesta rapida, persistencia eventual.
5. **Contratos explicitos.** Web/Mobile/Backend comparten semantica.
6. **Seguridad server-side.** Las apps son untrusted.

---

## 10. Reglas de Herencia de AGENTS.md

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
    +-- /apps/backend/AGENTS.md
    |
    +-- /apps/web/AGENTS.md
    |
    +-- /apps/mobile/AGENTS.md
```

---

## 11. Definition of Done (Global)

Cualquier cambio debe cumplir:

| App | Comando | Resultado |
|-----|---------|-----------|
| Backend | `bunx tsc --noEmit` | Sin errores |
| Web | `bun run build` | Build exitoso |
| Mobile | `bunx tsc --noEmit` | Sin errores |
| Produccion | `curl /api/health` | 200 OK |
| Produccion | `curl /api/ready` | 200 OK |

---

## 12. Estado Actual Consolidado

> **IMPORTANTE:** Este estado manda sobre cualquier supuesto viejo en AGENTS.md locales.

1. Backend productivo activo en `apps/backend/` (no `backend/` legacy)
2. Web productivo activo en `apps/web/` (antes `nexus-web/`)
3. Mobile en desarrollo en `apps/mobile/` (antes `goberna-territory0.2/`)
4. Ingesta de tracking y forms con write-behind en Redis Streams
5. Redis en produccion con politica `noeviction`
6. `AGENT_INGEST_TOKEN` obligatorio en produccion para tracking
7. `/api/metrics` expone latencias por ruta con p50/p90/p95/p99

---

## 13. Reglas Operativas de Produccion

1. **Nunca** subir `.env` a git
2. **Nunca** exponer PostgreSQL ni Redis a internet
3. **Siempre** deploy via `docker compose` en `/srv/app`
4. **Siempre** deploy reproducible por script
5. **Siempre** rollback inmediato si falla deploy

---

## 14. Anti-patterns a Evitar

- Kubernetes (overkill para 2 devs)
- Exponer DB/Redis publicamente
- Deploy manual sin CI/CD
- Backups sin test de restore
- Secretos en repositorio
- Documentacion desactualizada

---

## 15. Prioridad de Decision

Cuando haya conflicto, decidir en este orden:

1. Disponibilidad del servicio
2. Seguridad basica
3. Recuperacion ante fallos
4. Simplicidad operativa para 2 devs
5. Optimizacion/performance

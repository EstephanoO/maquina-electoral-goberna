# AGENTS.md - Web Admin Dashboard (Next.js)

> **Hereda de:** `/AGENTS.md` (root)  
> **Alcance:** Solo `apps/web/**`  
> **Ultima actualizacion:** 2026-02-23

---

## Flujo de Desarrollo

Ver `/CONTRIBUTING.md` para el flujo GitHub Flow completo.  
Ver seccion 9 del root `/AGENTS.md` para CI/CD y ramas.

---

## Contexto del Modulo

Dashboard administrativo web en Next.js 16.1 + React 19.2 + Tailwind 4.  
Deployed en Vercel (`dashboard.grupogoberna.com`), consume backend via proxy `/api/*` y `/uploads/*`.

---

## Arquitectura Modular

```
apps/web/
  app/                          # Next.js App Router
    (dashboard)/                # Dashboard routes (auth required)
      candidatos/               # Gestion de campanas/candidatos
      cms/                      # CMS de contactos (operadoras)
      cms-metrics/              # Metricas CMS global
      equipo/                   # Gestion de equipo
      formularios/              # Submissions de formularios
      map/                      # Mapa interactivo + tracking
      ops/                      # Panel operativo (metricas)
      settings/                 # Configuracion
      layout.tsx                # Dashboard layout
      page.tsx                  # Home (map view)
    login/                      # Login
    register/                   # Registro
    onboarding/                 # Onboarding
    layout.tsx                  # Root layout

  lib/                          # Shared code (MODULAR)
    types/                      # TypeScript type definitions
    constants/                  # App constants
    utils/                      # Pure utility functions
    hooks/                      # Custom React hooks
    services/                   # API services (data layer)
      api.ts                    # Base API client
      campaigns.ts              # Campaign CRUD
      access-requests.ts        # Access request operations
      cms.ts                    # CMS service
      forms.ts                  # Forms service
      geo.ts                    # Geo/zones service
      index.ts                  # Re-exports
    ui/                         # Reusable UI components
    schemas/                    # Validation schemas (vacio, para uso futuro)
    auth-context.tsx            # Auth state management
    api-client.ts               # Re-export (backward compat)
    query-provider.tsx          # TanStack Query provider
    mock-data.ts                # Legacy (deprecated)

  next.config.ts                # Rewrites for /api/* and /uploads/*
  package.json
```

---

## Principios de Arquitectura

### 1. Separacion de Responsabilidades

| Capa | Responsabilidad | Ubicacion |
|------|-----------------|-----------|
| **Types** | Definiciones TypeScript | `lib/types/` |
| **Constants** | Valores estaticos | `lib/constants/` |
| **Utils** | Funciones puras sin side-effects | `lib/utils/` |
| **Hooks** | Logica de estado reutilizable | `lib/hooks/` |
| **Services** | Comunicacion con API | `lib/services/` |
| **UI** | Componentes presentacionales | `lib/ui/` |
| **Features** | Componentes de negocio | `app/*/_components/` |
| **Pages** | Contenedores/orquestadores | `app/*/page.tsx` |

### 2. Reglas de Importacion

```typescript
// CORRECTO: Importar desde indices
import { Button, Spinner, Avatar } from "@/lib/ui";
import { slugify, formatDate } from "@/lib/utils";
import { listCampaigns, createCampaign } from "@/lib/services";
import type { Campaign, User } from "@/lib/types";

// INCORRECTO: Importar archivos directos
import { Button } from "@/lib/ui/button";  // No hacer
```

### 3. Tamano de Archivos

- **Paginas (`page.tsx`)**: Max ~200 lineas (orquestacion)
- **Componentes feature**: Max ~300 lineas
- **Componentes UI**: Max ~150 lineas
- **Hooks**: Max ~100 lineas
- **Services**: Max ~100 lineas por archivo

Si un archivo excede estos limites, **dividirlo**.

---

## Estructura de un Feature

Ejemplo: `/app/(dashboard)/candidatos/`

```
candidatos/
  _components/                  # Componentes propios del feature
    candidate-card.tsx
    candidate-list.tsx
    create-candidate-form.tsx
    index.ts                    # Re-exports
  page.tsx                      # Contenedor principal (~130 lineas)
```

**El page.tsx solo debe:**
- Importar componentes
- Manejar estado de alto nivel
- Coordinar data fetching
- Componer el layout

**Los componentes en `_components/` deben:**
- Ser independientes y testeables
- Recibir datos via props
- Emitir eventos via callbacks

---

## API Services

### Patron de Respuesta

```typescript
type ServiceResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};
```

---

## Conexion con Backend

### Rewrites (next.config.ts)

```typescript
const target = process.env.BACKEND_PROXY_TARGET ?? "https://api.goberna.us";

rewrites() {
  return {
    beforeFiles: [
      { source: "/api/:path*", destination: `${target}/api/:path*` },
      { source: "/uploads/:path*", destination: `${target}/uploads/:path*` },
    ],
  };
}
```

### Remote Images

```typescript
images: {
  remotePatterns: [
    { protocol: "https", hostname: "dashboard.grupogoberna.com", pathname: "/uploads/**" },
    { protocol: "https", hostname: "api.goberna.us", pathname: "/uploads/**" },
    { protocol: "http", hostname: "161.132.39.165", pathname: "/uploads/**" },
    { protocol: "http", hostname: "localhost", pathname: "/uploads/**" },
  ],
}
```

---

## Endpoints Consumidos

| Endpoint | Service | Proposito |
|----------|---------|-----------|
| `GET /api/campaigns` | `campaigns.ts` | Lista campanas |
| `POST /api/campaigns` | `campaigns.ts` | Crear campana |
| `GET /api/candidates` | `campaigns.ts` | Candidatos publicos |
| `GET /api/access-requests` | `access-requests.ts` | Solicitudes |
| `POST /api/access-requests/:id/resolve` | `access-requests.ts` | Resolver |
| `POST /api/uploads` | `api.ts` | Subir foto |
| `GET /api/auth/me` | `auth-context.tsx` | Perfil usuario |
| `GET /api/cms/contacts` | `cms.ts` | Contactos CMS |
| `GET /api/cms/stats` | `cms.ts` | Stats CMS |
| `GET /api/cms/metrics` | `cms.ts` | Metricas CMS global |
| `GET /api/cms/stream` | `cms.ts` | SSE CMS realtime |
| `GET /api/form-submissions/*` | `forms.ts` | Submissions |
| `GET /api/zones/*` | `geo.ts` | Zonas geograficas |
| `GET /api/agents/live` | (map page) | Tracking live |
| `GET /api/agents/stream` | (map page) | SSE tracking |
| `GET /api/metrics` | (ops page) | Metricas operativas |
| `GET /api/campaigns/:campaignId/analytics` | (analytics) | Datos GA4 |

---

## Development

### Setup
```bash
cd apps/web
bun install
cp .env.example .env.local
```

### Comandos
```bash
bun run dev      # Puerto 3000
bun run build    # Build produccion
bun run lint     # ESLint
```

---

## Definition of Done (Web)

1. `bun run build` en verde
2. Sin errores de hydration en consola
3. Paginas < 200 lineas
4. Componentes feature < 300 lineas
5. Imports desde indices (`lib/ui`, `lib/services`)
6. Types en `lib/types/`

---

## Migracion de Codigo Legacy

Al encontrar archivos grandes (>300 lineas):

1. Identificar responsabilidades mezcladas
2. Extraer tipos a `lib/types/`
3. Extraer constantes a `lib/constants/`
4. Extraer logica a `lib/hooks/` o `lib/services/`
5. Extraer UI a `lib/ui/`
6. Extraer componentes feature a `_components/`
7. Dejar page.tsx como orquestador ligero

---

## Performance

- Reducir rerenders en handlers intensivos
- Usar `useCallback` para funciones pasadas a hijos
- Lazy load de componentes pesados (mapas)
- Imagenes con `unoptimized` para URLs externas
- TanStack Query para cache y dedup de requests

---

## Comunicacion con Otros Modulos

| Modulo | Relacion |
|--------|----------|
| Backend (`apps/backend`) | Consume via proxy `/api/*` |
| Mobile (`apps/mobile`) | Comparte backend, no comunicacion directa |
| Tegola | Tiles servidos via backend proxy |
| Uploads | Servidos via `/uploads/*` proxy |

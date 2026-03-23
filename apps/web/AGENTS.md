# AGENTS.md - Web Admin Dashboard (Next.js)

> **Hereda de:** `/AGENTS.md` (root)  
> **Alcance:** Solo `apps/web/**`  
> **Ultima actualizacion:** 2026-03-23

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
import { cn, slugify, formatDate } from "@/lib/utils";
import { listCampaigns, createCampaign } from "@/lib/services";
import type { Campaign, User } from "@/lib/types";
import { Users, MapPin } from "lucide-react";

// INCORRECTO: Importar archivos directos
import { Button } from "@/lib/ui/button";  // No hacer
import { cn } from "@/lib/utils/index";    // No hacer
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
    { protocol: "http", hostname: "localhost", pathname: "/uploads/**" },
  ],
}
```

> **Nota:** No incluir IPs de VPS en `remotePatterns` (leak de infraestructura interna).

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

## Seguridad Web (Auth Cookie-Based)

> Ver seccion 10.6 del root `/AGENTS.md` para la arquitectura completa.

### Middleware (`middleware.ts`)

- Protege rutas server-side **ANTES** de renderizar contenido
- **Fail-closed**: rutas no reconocidas se tratan como protegidas
- Solo rutas publicas explicitas pasan sin auth: `/`, `/login`, `/register`, `/onboarding`, `/descargar`, `/extension`, `/voluntarios`
- Revisa cookie `goberna_session` — si no existe, redirect a `/login?from=<path>`
- Agrega security headers a todas las respuestas

### Auth Context (`lib/auth-context.tsx`)

- **NO** guarda tokens en localStorage/sessionStorage
- Sesion se detecta via cookie `goberna_session=1` (no-httpOnly, solo flag)
- Refresh llama `POST /api/auth/refresh` con body vacio + `credentials: "same-origin"` (el cookie httpOnly va automaticamente)
- Logout llama `POST /api/auth/logout` que limpia todas las cookies server-side

### API Client (`lib/services/api.ts`)

- Todas las requests usan `credentials: "same-origin"` para enviar cookies
- NO hay header `Authorization` manual (el JWT viaja en httpOnly cookie automaticamente via proxy)

### SSE (patron obligatorio)

Toda conexion SSE en el dashboard **DEBE**:

1. Usar `credentials: "same-origin"` en el `fetch()`
2. Manejar 401 intentando `POST /api/auth/refresh` una sola vez
3. Re-intentar la conexion SSE si el refresh tuvo exito
4. Reconectar con **backoff exponencial** (max 30s), NUNCA intervalo fijo
5. Implementaciones de referencia:
   - `use-agent-sse.ts` (tracking agents — incluye heartbeat timeout)
   - `cms/page.tsx` (CMS contacts)

### Security Headers

Headers aplicados en dos capas (cobertura completa — intencional):

**`next.config.ts`** (rutas estaticas):

| Header | Valor |
|--------|-------|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(self)` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |

**`middleware.ts`** (rutas dinamicas):

| Header | Valor |
|--------|-------|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(self)` |
| `X-DNS-Prefetch-Control` | `on` |

### Reglas de seguridad (No Negociables)

- **NUNCA** guardar tokens en localStorage/sessionStorage
- **NUNCA** leer el JWT desde JavaScript (es httpOnly)
- **NUNCA** usar `window`/`document` en render inicial (hydration mismatch) — usar `useState` + `useEffect`
- **NUNCA** incluir IPs de infraestructura en `remotePatterns` de `next.config.ts`
- Al agregar una ruta nueva al dashboard: se protege automaticamente (fail-closed)
- Al agregar una ruta publica nueva: agregarla explicitamente a `PUBLIC_PATHS` o prefijos publicos en `middleware.ts`

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
7. Sin tokens en localStorage/sessionStorage
8. SSE con 401 handling + backoff exponencial

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

## UI Component Library

### Stack

| Herramienta | Proposito |
|-------------|-----------|
| `tailwind-merge` + `clsx` | `cn()` utility para componer clases sin conflictos |
| `class-variance-authority` (cva) | Variant system type-safe para componentes con multiples estilos |
| `lucide-react` | Iconos — NO crear SVGs manuales, usar Lucide |
| `shadcn/ui` | CLI para instalar componentes accesibles (Radix + Tailwind) |
| `components.json` | Configuracion de shadcn — define paths y aliases |

### Convenciones de Estilo

```typescript
// CORRECTO: Usar cn() para className composition
import { cn } from "@/lib/utils";

<div className={cn("bg-surface rounded-lg border border-border", isActive && "border-primary", className)} />

// CORRECTO: Usar tokens semanticos de Tailwind
<p className="text-text-secondary text-sm" />
<div className="bg-surface-elevated shadow-md rounded-lg" />

// INCORRECTO: Inline styles con CSS vars
<div style={{ background: "var(--color-surface)", color: "var(--color-text-secondary)" }} />

// INCORRECTO: Clases Tailwind raw que rompen dark mode
<div className="bg-white text-slate-700 border-slate-200" />

// INCORRECTO: Hex hardcodeados
<div style={{ background: "#ecfdf5", color: "#166534" }} />
```

### Tokens Semanticos Disponibles (Tailwind)

Todos los tokens respetan dark mode automaticamente via CSS variables.

| Categoria | Utilidades Tailwind |
|-----------|-------------------|
| **Surfaces** | `bg-background`, `bg-surface`, `bg-surface-elevated`, `bg-surface-hover`, `bg-surface-active` |
| **Text** | `text-foreground`, `text-text-primary`, `text-text-secondary`, `text-text-tertiary`, `text-text-on-primary` |
| **Borders** | `border-border`, `border-border-strong`, `border-border-hover` |
| **Primary** | `bg-primary`, `bg-primary-hover`, `text-primary` |
| **Accent** | `bg-accent`, `text-accent`, `bg-accent-subtle` |
| **Status** | `text-success`, `bg-success-bg`, `border-success-border` (idem warning, error, info) |
| **Brand** | `bg-goberna-blue-{50-950}`, `bg-goberna-gold`, `text-goberna-gold-{50-700}` |
| **Shadows** | `shadow-xs`, `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl` |
| **Radii** | `rounded-xs` (4px), `rounded-sm` (6px), `rounded-md` (8px), `rounded-lg` (12px), `rounded-xl` (16px) |

### Iconos

```typescript
// CORRECTO: Importar de lucide-react
import { Users, MapPin, ChevronDown } from "lucide-react";
<Users className="size-4 text-text-secondary" />

// INCORRECTO: SVG inline manual
<svg width="16" height="16" viewBox="0 0 24 24">...</svg>

// LEGACY (tolerable por ahora): Importar de lib/ui/icons.tsx
import { IconUsers } from "@/lib/ui";
// Se migrara a lucide-react gradualmente
```

### Crear Componentes con cva

```typescript
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-primary text-text-on-primary",
        success: "bg-success-bg text-success border border-success-border",
        warning: "bg-warning-bg text-warning border border-warning-border",
        error: "bg-error-bg text-error border border-error-border",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

### Instalar Componentes shadcn

```bash
# Instalar un componente (se coloca en lib/ui/ segun components.json)
bunx --bun shadcn@latest add dialog
bunx --bun shadcn@latest add dropdown-menu
bunx --bun shadcn@latest add tooltip
```

### Reglas (No Negociables)

1. **NUNCA** crear SVGs manuales — usar `lucide-react`
2. **NUNCA** usar `bg-white`, `bg-slate-*`, `text-slate-*` — usar tokens semanticos
3. **NUNCA** usar hex hardcodeados en estilos — usar tokens
4. **SIEMPRE** usar `cn()` para componer className (nunca template literals con clases)
5. **SIEMPRE** que un componente acepte `className` prop, pasarlo a `cn()` como ultimo argumento
6. Los componentes en `lib/ui/` son la unica fuente de verdad — NO duplicar en features

---

## Comunicacion con Otros Modulos

| Modulo | Relacion |
|--------|----------|
| Backend (`apps/backend`) | Consume via proxy `/api/*` |
| Mobile (`apps/mobile`) | Comparte backend, no comunicacion directa |
| Tegola | Tiles servidos via backend proxy |
| Uploads | Servidos via `/uploads/*` proxy |

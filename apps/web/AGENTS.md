# AGENTS.md - Web Admin Dashboard (Next.js)

> **Hereda de:** `/AGENTS.md` (root)  
> **Alcance:** Solo `apps/web/**`  
> **Ultima actualizacion:** 2026-02-16

---

## Contexto del Modulo

Dashboard administrativo web en Next.js 16 + React 19.  
Deployed en Vercel, consume backend via proxy `/api/*` y `/uploads/*`.

---

## Arquitectura Modular

```
apps/web/
├── app/                          # Next.js App Router
│   ├── (dashboard)/              # Dashboard routes (auth required)
│   │   ├── candidatos/
│   │   │   ├── _components/      # Feature-specific components
│   │   │   └── page.tsx          # Page container (~130 lines)
│   │   ├── equipo/
│   │   ├── formularios/
│   │   ├── cms/
│   │   ├── map/
│   │   ├── ops/
│   │   ├── settings/
│   │   ├── layout.tsx            # Dashboard layout
│   │   └── page.tsx              # Home (map view)
│   ├── login/
│   ├── register/
│   ├── onboarding/
│   └── layout.tsx                # Root layout
│
├── lib/                          # Shared code (MODULAR)
│   ├── types/                    # TypeScript type definitions
│   │   └── index.ts              # Campaign, User, Form, etc.
│   ├── constants/                # App constants
│   │   └── index.ts              # Colors, cargos, config
│   ├── utils/                    # Pure utility functions
│   │   └── index.ts              # slugify, formatDate, etc.
│   ├── hooks/                    # Custom React hooks
│   │   ├── use-async.ts
│   │   ├── use-file-upload.ts
│   │   ├── use-inject-styles.ts
│   │   └── index.ts
│   ├── services/                 # API services (data layer)
│   │   ├── api.ts                # Base API client
│   │   ├── campaigns.ts          # Campaign CRUD
│   │   ├── access-requests.ts    # Access request operations
│   │   └── index.ts
│   ├── ui/                       # Reusable UI components
│   │   ├── spinner.tsx
│   │   ├── status-badge.tsx
│   │   ├── avatar.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── tabs.tsx
│   │   ├── slide-over.tsx
│   │   ├── empty-state.tsx
│   │   ├── alert.tsx
│   │   ├── form-field.tsx
│   │   ├── photo-upload.tsx
│   │   └── index.ts
│   ├── api-client.ts             # Re-export (backward compat)
│   ├── auth-context.tsx          # Auth state management
│   └── mock-data.ts              # Legacy (deprecated)
│
├── public/                       # Static assets
├── next.config.ts                # Rewrites for /api/* and /uploads/*
└── package.json
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
// ✅ CORRECTO: Importar desde indices
import { Button, Spinner, Avatar } from "@/lib/ui";
import { slugify, formatDate } from "@/lib/utils";
import { listCampaigns, createCampaign } from "@/lib/services";
import type { Campaign, User } from "@/lib/types";

// ❌ INCORRECTO: Importar archivos directos
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
├── _components/                  # Componentes propios del feature
│   ├── candidate-card.tsx        # Card de un candidato
│   ├── candidate-list.tsx        # Lista de candidatos
│   ├── create-candidate-form.tsx # Formulario de creacion
│   ├── access-request-card.tsx   # Card de solicitud
│   ├── access-request-list.tsx   # Lista de solicitudes
│   └── index.ts                  # Re-exports
└── page.tsx                      # Contenedor principal (~130 lineas)
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

### Uso Correcto

```typescript
// lib/services/campaigns.ts
export async function createCampaignWithPhoto(
  input: CreateCampaignInput,
  photoFile: File | null,
): Promise<{ ok: boolean; campaign?: Campaign; error?: string }> {
  // 1. Upload photo if provided
  // 2. Create campaign with foto_url
  // 3. Return result
}

// En el componente
import { createCampaignWithPhoto } from "@/lib/services";

const result = await createCampaignWithPhoto(formData, photoFile);
if (!result.ok) {
  setError(result.error);
  return;
}
```

### Patron de Respuesta

```typescript
type ServiceResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};
```

---

## UI Components

### Principios

1. **Stateless cuando sea posible** - Estado manejado por el padre
2. **Estilos inline con CSS variables** - Consistencia visual
3. **Props tipados estrictamente** - Autodocumentacion
4. **Accesibilidad basica** - Labels, roles, aria

### Ejemplo de uso

```tsx
import { Button, TextInput, SlideOver, Alert } from "@/lib/ui";

<SlideOver open={showPanel} onClose={() => setShowPanel(false)} title="Nuevo">
  <TextInput
    id="name"
    label="Nombre"
    value={name}
    onChange={(e) => setName(e.target.value)}
  />
  {error && <Alert variant="error" message={error} />}
  <Button variant="primary" loading={saving} onClick={handleSave}>
    Guardar
  </Button>
</SlideOver>
```

---

## Conexion con Backend

### Rewrites (next.config.ts)

```typescript
async rewrites() {
  return [
    { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
    { source: "/uploads/:path*", destination: `${BACKEND}/uploads/:path*` },
  ];
}
```

### Remote Images

```typescript
images: {
  remotePatterns: [
    { protocol: "http", hostname: "161.132.39.165", pathname: "/uploads/**" },
    { protocol: "http", hostname: "localhost", pathname: "/uploads/**" },
  ],
}
```

---

## Endpoints Consumidos

| Endpoint | Service | Proposito |
|----------|---------|-----------|
| `GET /api/campaigns` | `listCampaigns()` | Lista campanas |
| `POST /api/campaigns` | `createCampaign()` | Crear campana |
| `GET /api/candidates` | `listCandidates()` | Candidatos publicos |
| `GET /api/access-requests` | `listAccessRequests()` | Solicitudes |
| `PUT /api/access-requests/:id` | `resolveAccessRequest()` | Resolver |
| `POST /api/uploads` | `uploadCandidatePhoto()` | Subir foto |
| `GET /api/auth/me` | (auth-context) | Perfil usuario |

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

---

## Comunicacion con Otros Modulos

| Modulo | Relacion |
|--------|----------|
| Backend (`apps/backend`) | Consume via proxy `/api/*` |
| Mobile (`apps/mobile`) | Comparte backend, no comunicacion directa |
| Tegola | Tiles servidos via backend proxy |
| Uploads | Servidos via `/uploads/*` proxy |

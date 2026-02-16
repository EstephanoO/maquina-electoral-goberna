# AGENTS.md - Web Admin Dashboard (Next.js)

> **Hereda de:** `/AGENTS.md` (root)  
> **Alcance:** Solo `apps/web/**`

---

## Contexto del Modulo

Dashboard administrativo web en Next.js 16 + React 19.  
Deployed en Vercel, consume backend via proxy `/api/*`.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                         Vercel                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    Next.js App                          │ │
│  │                                                         │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │ │
│  │  │   Login      │  │  Dashboard   │  │   Mapa       │  │ │
│  │  │  (auth/)     │  │ (dashboard/) │  │  (home)      │  │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │ │
│  │         │                 │                 │          │ │
│  │         └────────────┬────┴─────────────────┘          │ │
│  │                      │                                  │ │
│  │              ┌───────▼───────┐                         │ │
│  │              │  API Client   │                         │ │
│  │              │ (lib/api-*)   │                         │ │
│  │              └───────┬───────┘                         │ │
│  └──────────────────────┼──────────────────────────────────┘ │
│                         │                                    │
│                  /api/* (proxy)                              │
└─────────────────────────┼────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   Backend (VPS)       │
              │   161.132.39.165      │
              └───────────────────────┘
```

---

## Rutas del Codigo

| Concepto | Ruta |
|----------|------|
| Root layout | `app/layout.tsx` |
| Home/Mapa | `app/page.tsx` |
| Login | `app/login/page.tsx` |
| Dashboard | `app/(dashboard)/` |
| API Client | `lib/api-client.ts` |
| Auth Context | `lib/auth-context.tsx` |
| Stores | `lib/stores/` |
| Config Next.js | `next.config.ts` |
| Env example | `.env.example` |

---

## Conexion con el Sistema

### Flujo de Autenticacion
```
┌─────────┐         ┌─────────┐         ┌─────────┐
│   Web   │         │  Proxy  │         │ Backend │
│ (React) │         │ (Next)  │         │(Fastify)│
└────┬────┘         └────┬────┘         └────┬────┘
     │                   │                   │
     │ POST /api/auth/login                  │
     │──────────────────>│                   │
     │                   │ POST /api/auth/login
     │                   │──────────────────>│
     │                   │                   │
     │                   │  { accessToken,   │
     │                   │    refreshToken,  │
     │                   │    user }         │
     │                   │<──────────────────│
     │                   │                   │
     │  Store tokens     │                   │
     │  (localStorage)   │                   │
     │<──────────────────│                   │
```

### Datos que Consume
| Endpoint | Proposito |
|----------|-----------|
| `GET /api/auth/me` | Perfil + campanas del usuario |
| `GET /api/campaigns/:id` | Config de campana activa |
| `GET /api/agents/live` | Posiciones actuales de agentes |
| `GET /api/agents/stream` | SSE de posiciones realtime |
| `GET /api/metrics` | Metricas operativas |
| `GET /api/form-definitions/active` | Formularios activos |

### Conexion con Mobile
```
Ambos consumen el mismo backend.
Web ve datos agregados; Mobile genera datos individuales.

Web Dashboard                    Mobile App
     │                                │
     │  GET /api/agents/live          │ POST /api/agents/location
     │<─────────────────────────┬─────│─────────────────────────>
     │                          │     │
     │                    ┌─────▼─────┐
     │                    │  Backend  │
     │                    │ (Redis +  │
     │                    │  Postgres)│
     │                    └───────────┘
```

---

## Reglas de Arquitectura

1. **SSR donde tenga sentido** - Datos iniciales server-side, updates client-side
2. **Evitar hydration mismatch** - Sin branch no determinista SSR/CSR
3. **Estado hover/transitorio con refs** - No rerenders masivos en mousemove
4. **SSE para realtime** - Unidireccional, no WebSockets innecesarios
5. **Payload minimo** - Solo datos necesarios para renderizar

---

## Variables de Entorno

### Desarrollo Local (`apps/web/.env.local`)
```bash
BACKEND_PROXY_TARGET=http://localhost:3001
```

### Produccion (Vercel Environment Variables)
```bash
BACKEND_PROXY_TARGET=http://161.132.39.165
```

---

## Desarrollo Local

### Setup
```bash
cd apps/web
bun install
cp .env.example .env.local  # Editar con valores locales
```

### Comandos
```bash
bun run dev      # Puerto 3000, proxy a backend local
bun run build    # Build de produccion
bun run lint     # ESLint
```

### Requisitos
- Backend corriendo en `localhost:3001`
- O usar `BACKEND_PROXY_TARGET` apuntando a produccion

---

## Definition of Done (Web)

1. `bun run build` en verde
2. Sin errores de hydration en consola del browser
3. Mapa carga tiles correctamente
4. Login/logout funciona
5. Si cambia contrato, actualizar docs compartidos

---

## Performance

- Reducir rerenders en handlers intensivos (`mousemove`, `drag`)
- Mantener payload de marcadores de agentes minimo
- Testear con dataset realista
- No asumir historico en cliente: live state solamente
- Lazy load de componentes pesados (mapas)

---

## Comunicacion con Otros Modulos

| Modulo | Relacion |
|--------|----------|
| Backend (`apps/backend`) | Consume via proxy `/api/*` |
| Mobile (`apps/mobile`) | Comparte backend, no comunicacion directa |
| Tegola | Tiles servidos via backend proxy |

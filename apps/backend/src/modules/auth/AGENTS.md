# AGENTS.md - Modulo AUTH (Sistema Completo)

> **Hereda de:** `/AGENTS.md` (root)  
> **Referencia:** `/docs/MODULES.md`  
> **Alcance:** Autenticacion en Backend + Web + Mobile

---

## Proposito

Manejar autenticacion JWT con refresh tokens, soportando multi-tenant por campaign.

---

## Componentes por App

### Backend (`apps/backend/src/modules/auth/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `routes.ts` | Endpoints HTTP |
| `service.ts` | Logica: hash passwords, generar/validar JWT |
| `repository.ts` | Queries: users, refresh_tokens, user_campaigns |
| `schemas.ts` | Validacion Zod |
| `types.ts` | Tipos TypeScript |

### Web (`apps/web/lib/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `auth-context.tsx` | Provider React con estado de auth |
| `api-client.ts` | HTTP client con auto-refresh de tokens |

**Paginas:**
- `app/login/page.tsx` - Login
- `app/register/page.tsx` - Registro
- `app/(dashboard)/layout.tsx` - Verifica auth, redirect si no

### Mobile (`apps/mobile/lib/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `auth-store.ts` | SecureStore para tokens (cifrado) |
| `api.ts` | HTTP client con auto-refresh |
| `app-context.tsx` | Estado global de usuario/campaign |

**Pantallas:**
- `app/(auth)/login.tsx` - Login
- `app/(auth)/register.tsx` - Registro
- `app/(auth)/pending.tsx` - Esperando aprobacion
- `app/_layout.tsx` - Verifica auth al iniciar

---

## Flujo de Login

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LOGIN FLOW                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  MOBILE/WEB                    BACKEND                              │
│  ──────────                    ───────                              │
│                                                                      │
│  1. Usuario ingresa            POST /api/auth/login                 │
│     email + password    ────►  { email, password }                  │
│                                       │                              │
│                                       ▼                              │
│                                service.ts                            │
│                                - findUserByEmail()                   │
│                                - bcrypt.compare()                    │
│                                       │                              │
│                                       ▼                              │
│                                Genera tokens:                        │
│                                - access_token (JWT, 15m)             │
│                                - refresh_token (opaco, 7d)           │
│                                       │                              │
│                                       ▼                              │
│                                Guarda refresh_token                  │
│                                hasheado en DB                        │
│                                       │                              │
│  2. Recibe respuesta    ◄────────────┘                              │
│     {                                                                │
│       access_token,                                                  │
│       refresh_token,                                                 │
│       user: {...},                                                   │
│       campaigns: [...]                                               │
│     }                                                                │
│                                                                      │
│  3. Guarda tokens:                                                   │
│     - Web: localStorage                                              │
│     - Mobile: SecureStore                                            │
│                                                                      │
│  4. Redirect a dashboard                                             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Flujo de Auto-Refresh

```
┌─────────────────────────────────────────────────────────────────────┐
│                      AUTO-REFRESH FLOW                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  MOBILE/WEB                    BACKEND                              │
│  ──────────                    ───────                              │
│                                                                      │
│  1. Request con JWT     ────►  Cualquier endpoint                   │
│     Authorization: Bearer xxx         │                              │
│                                       ▼                              │
│                                Valida JWT                            │
│                                       │                              │
│                                   EXPIRED?                           │
│                                   /      \                           │
│                                 NO        YES                        │
│                                 │          │                         │
│                                 ▼          ▼                         │
│                              Continua   Return 401                   │
│                                          │                           │
│  2. Recibe 401          ◄────────────────┘                          │
│                                                                      │
│  3. Auto-refresh:              POST /api/auth/refresh               │
│     { refresh_token }   ────►  { refresh_token }                    │
│                                       │                              │
│                                       ▼                              │
│                                Valida refresh en DB                  │
│                                Genera nuevo par de tokens            │
│                                Rota refresh token                    │
│                                       │                              │
│  4. Nuevos tokens       ◄────────────┘                              │
│                                                                      │
│  5. Retry request original                                           │
│     con nuevo access_token                                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Contratos API

### POST /api/auth/login

```typescript
// Request
{ email: string, password: string }

// Response 200
{
  ok: true,
  request_id: string,
  access_token: string,
  refresh_token: string,
  user: {
    id: string,
    email: string,
    full_name: string,
    role: "admin" | "user",
    status: "active" | "pending" | "suspended"
  },
  campaigns: [{
    id: string,
    name: string,
    slug: string,
    role: "admin" | "candidato" | "operador" | "encuestador"
  }]
}

// Response 401
{ ok: false, code: "AUTH_INVALID_CREDENTIALS", message: "email o password incorrectos" }
```

### POST /api/auth/refresh

```typescript
// Request
{ refresh_token: string }

// Response 200
{
  ok: true,
  access_token: string,
  refresh_token: string  // Nuevo (rotacion)
}

// Response 401
{ ok: false, code: "AUTH_REFRESH_INVALID", message: "refresh token invalido" }
```

### GET /api/auth/me

```typescript
// Headers: Authorization: Bearer <access_token>

// Response 200
{
  ok: true,
  user: { id, email, full_name, role, status },
  campaigns: [{ id, name, slug, role }]
}
```

---

## Almacenamiento de Tokens

### Web (apps/web)

```typescript
// lib/auth-context.tsx
const STORAGE_KEYS = {
  accessToken: "goberna_access_token",
  refreshToken: "goberna_refresh_token",
  activeCampaign: "goberna_active_campaign",
};

// Guardar
localStorage.setItem(STORAGE_KEYS.accessToken, token);

// Leer
const token = localStorage.getItem(STORAGE_KEYS.accessToken);
```

### Mobile (apps/mobile)

```typescript
// lib/auth-store.ts
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  ACCESS_TOKEN: 'goberna_access_token',
  REFRESH_TOKEN: 'goberna_refresh_token',
  USER_JSON: 'goberna_user',
  CAMPAIGNS_JSON: 'goberna_campaigns',
  ACTIVE_CAMPAIGN_ID: 'goberna_active_campaign_id',
};

// Guardar (cifrado en keychain)
await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, token);

// Leer
const token = await SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
```

---

## Variables de Entorno (Backend)

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `JWT_SECRET` | **requerido** | Min 32 chars |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Duracion access token |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Duracion refresh token |
| `BCRYPT_ROUNDS` | `10` | Costo de hash |

---

## Tablas de DB

```sql
-- users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- refresh_tokens
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- user_campaigns (multi-tenant)
CREATE TABLE user_campaigns (
  user_id UUID REFERENCES users(id),
  campaign_id UUID REFERENCES campaigns(id),
  role VARCHAR(50) NOT NULL,
  PRIMARY KEY (user_id, campaign_id)
);
```

---

## Checklist de Cambios

Al modificar auth, verificar:

- [ ] Backend: `bunx tsc --noEmit` sin errores
- [ ] Backend: Login funciona `curl -X POST /api/auth/login`
- [ ] Backend: Refresh funciona sin 401 en cascada
- [ ] Web: Login redirect a dashboard
- [ ] Web: Refresh automatico transparente
- [ ] Mobile: Login guarda en SecureStore
- [ ] Mobile: Refresh funciona en background
- [ ] Tokens tienen mismo formato en Web y Mobile

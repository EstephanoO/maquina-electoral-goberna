# AGENTS.md - Modulo CAMPAIGNS (Sistema Completo)

> **Hereda de:** `/AGENTS.md` (root)  
> **Referencia:** `/docs/MODULES.md`  
> **Alcance:** Multi-tenancy en Backend + Web + Mobile

---

## Proposito

Gestionar campanas (tenants) del sistema:
- Cada usuario puede pertenecer a multiples campanas
- Cada campana tiene su propia config, formularios, agentes
- Todo el sistema filtra por campaign_id

---

## Componentes por App

### Backend (`apps/backend/src/modules/campaigns/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `routes.ts` | Endpoints: get campaign, list |
| `repository.ts` | Queries campaigns, user_campaigns |
| `schemas.ts` | Validacion Zod |

### Web (`apps/web/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/(dashboard)/layout.tsx` | Selector de campana activa |
| `lib/auth-context.tsx` | Estado de campana activa |

### Mobile (`apps/mobile/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `lib/app-context.tsx` | Campaign activa en contexto |
| `lib/auth-store.ts` | Persistir campaign activa |

---

## Flujo Multi-Tenant

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MULTI-TENANT FLOW                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  MOBILE/WEB                    BACKEND                              │
│  ──────────                    ───────                              │
│                                                                      │
│  1. Login                                                            │
│     POST /api/auth/login ────► routes.ts                            │
│                                   │                                  │
│                              Obtiene campanas                        │
│                              del usuario                             │
│                                   │                                  │
│     ◄─── { campaigns: [...] } ───┘                                  │
│                                                                      │
│  2. Usuario selecciona                                               │
│     campana activa                                                   │
│         │                                                            │
│         ▼                                                            │
│  3. Guardar en storage                                               │
│     - Web: localStorage                                              │
│     - Mobile: SecureStore                                            │
│         │                                                            │
│         ▼                                                            │
│  4. Requests con header                                              │
│     x-campaign-id: <uuid>  ────► Middleware                         │
│                                   │                                  │
│                              Valida que user                         │
│                              pertenece a campaign                    │
│                                   │                                  │
│                                   ▼                                  │
│                              Repository filtra                       │
│                              por campaign_id                         │
│                                   │                                  │
│     ◄─── Datos filtrados ────────┘                                  │
│                                                                      │
│                                                                      │
│  EJEMPLO: GET /api/form-definitions/active                           │
│  ─────────────────────────────────────────                           │
│                                                                      │
│  Request:                                                            │
│    Authorization: Bearer <jwt>                                       │
│    x-campaign-id: abc-123                                            │
│                                                                      │
│  Backend:                                                            │
│    1. Valida JWT -> userId                                           │
│    2. Lee x-campaign-id -> campaignId                                │
│    3. Verifica user_campaigns(userId, campaignId) existe             │
│    4. SELECT * FROM form_definitions WHERE campaign_id = campaignId  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Contratos API

### GET /api/campaigns/:id

**Auth:** JWT Bearer (debe pertenecer a la campana)

```typescript
// Response 200
{
  ok: true,
  campaign: {
    id: string,
    name: string,
    slug: string,
    description?: string,
    status: "active" | "paused" | "archived",
    config: {
      tracking_enabled: boolean,
      forms_enabled: boolean,
      map_bounds?: [number, number, number, number],
      theme?: { primary_color: string }
    },
    created_at: string
  }
}

// Response 403 (no pertenece)
{ ok: false, code: "AUTH_UNAUTHORIZED", message: "..." }
```

### GET /api/candidates

**Auth:** No requerido (publico)

```typescript
// Response 200
{
  ok: true,
  candidates: [{
    id: string,
    name: string,
    slug: string,
    logo_url?: string,
    status: "active"
  }]
}
```

---

## Header x-campaign-id

Todos los endpoints que operan con datos de campana requieren este header:

| Endpoint | Requiere x-campaign-id |
|----------|------------------------|
| `/api/auth/*` | No |
| `/api/health` | No |
| `/api/ready` | No |
| `/api/candidates` | No |
| `/api/config` | No |
| `/api/campaigns/:id` | No (usa param) |
| `/api/form-definitions/*` | **Si** |
| `/api/forms/*` | **Si** |
| `/api/agents/*` | **Si** (excepto location) |
| `/api/access-requests/*` | **Si** |

---

## Tablas de DB

```sql
-- campaigns
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- user_campaigns (relacion muchos a muchos)
CREATE TABLE user_campaigns (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,  -- admin, candidato, operador, encuestador
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, campaign_id)
);

-- Indices
CREATE INDEX idx_user_campaigns_user ON user_campaigns(user_id);
CREATE INDEX idx_user_campaigns_campaign ON user_campaigns(campaign_id);
```

---

## Web: Selector de Campana

```typescript
// apps/web/app/(dashboard)/layout.tsx

const { campaigns, activeCampaignId, setActiveCampaign } = useAuth();

// Dropdown para cambiar campana
<select 
  value={activeCampaignId} 
  onChange={(e) => setActiveCampaign(e.target.value)}
>
  {campaigns.map(c => (
    <option key={c.id} value={c.id}>{c.name}</option>
  ))}
</select>
```

```typescript
// apps/web/lib/auth-context.tsx

const setActiveCampaign = useCallback((campaignId: string) => {
  setActiveCampaignId(campaignId);
  localStorage.setItem(STORAGE_KEYS.activeCampaign, campaignId);
}, []);
```

---

## Mobile: Campaign Context

```typescript
// apps/mobile/lib/app-context.tsx

const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);

// Al login, auto-seleccionar primera campana
useEffect(() => {
  if (campaigns.length > 0 && !activeCampaignId) {
    setActiveCampaignId(campaigns[0].id);
  }
}, [campaigns]);

// Persistir en SecureStore
const setActiveCampaign = async (id: string) => {
  setActiveCampaignId(id);
  await SecureStore.setItemAsync('goberna_active_campaign_id', id);
};
```

```typescript
// apps/mobile/lib/api.ts

// Adjuntar header en cada request
if (auth) {
  const campaignId = await getActiveCampaignId();
  if (campaignId) {
    headers['x-campaign-id'] = campaignId;
  }
}
```

---

## Roles por Campana

| Rol | Permisos |
|-----|----------|
| `admin` | Todo: config, usuarios, formularios, reportes |
| `candidato` | Ver dashboard, reportes, mapa |
| `operador` | Gestionar agentes, ver mapa en tiempo real |
| `encuestador` | Solo llenar formularios en mobile |

---

## Checklist de Cambios

Al modificar campaigns, verificar:

- [ ] Backend: `bunx tsc --noEmit` sin errores
- [ ] Backend: `/api/campaigns/:id` valida pertenencia
- [ ] Backend: Endpoints filtran por campaign_id
- [ ] Backend: x-campaign-id header se procesa correctamente
- [ ] Web: Selector de campana funciona
- [ ] Web: Cambio de campana recarga datos
- [ ] Mobile: Campaign activa persiste en SecureStore
- [ ] Mobile: Header se envia en cada request
- [ ] Login retorna lista de campanas del usuario

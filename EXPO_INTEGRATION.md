# Goberna Expo <-> Backend Integration Guide

**Fecha:** 2026-02-16
**Estado:** Documento maestro de sincronizacion
**Alcance:** Que hacer en la app Expo (`goberna-territory0.2/`) para que funcione con el backend productivo (`apps/backend/`) y el frontend web (`nexus-web/`)

---

## 0. Resumen ejecutivo

La app Expo esta bien escrita pero apunta a un contrato que **no coincide** con el backend real. Este documento lista cada desajuste y la accion concreta para resolverlo.

| Area | Estado Expo | Estado Backend | Gap |
|------|-------------|---------------|-----|
| Auth (login/refresh/logout) | Implementado | Implementado | Campos difieren (ver seccion 2) |
| Register | Implementado | Implementado | Expo envia `phone`, backend no lo acepta |
| App Config | Espera `GET /api/app-config` | **No existe** | Hay que crear o reemplazar |
| Forms submission | `POST /api/registros` | `POST /api/forms` | Endpoint y payload distintos |
| Forms listing | `GET /api/registros` | **No existe como tal** | El backend tiene forms pero sin endpoint de listado para agentes |
| Access Requests | Alineado | Implementado | Payload de resolve difiere |
| GPS Tracking | **No implementado** | Implementado | Hay que construir en Expo |
| Offline queue | **No implementado** | N/A (cliente) | Critico para campo |
| API Base URL | Hardcoded `localhost:3000` | Produccion `https://api.<dominio>` | Hay que leer de env |

---

## 1. Configuracion de red y entorno

### Problema actual

`lib/api.ts` tiene hardcodeado:

```typescript
const API_BASE = 'http://localhost:3000/api';
```

`app.json` tiene `EXPO_PUBLIC_BACKEND_API_URL` pero el codigo no lo lee.

### Solucion

Cambiar `lib/api.ts`:

```typescript
import Constants from 'expo-constants';

const API_BASE =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_API_URL ??
  process.env.EXPO_PUBLIC_BACKEND_API_URL ??
  'http://localhost:3000/api';
```

### URLs de produccion

| Entorno | URL |
|---------|-----|
| Backend produccion | `https://api.<dominio>/api` |
| Backend dev (VPS directo) | `http://161.132.39.165/api` |
| Frontend web | `https://maquina-electoral-goberna-web.vercel.app` |

### Variables de entorno para Expo

Definir en `app.json` > `extra` y en `eas.json` por perfil:

```json
{
  "EXPO_PUBLIC_BACKEND_API_URL": "https://api.<dominio>/api",
  "EXPO_PUBLIC_AGENT_INGEST_TOKEN": "<token_de_produccion>"
}
```

---

## 2. Auth — Login

### Lo que Expo envia hoy

```typescript
POST /api/auth/login
{ email: string, password: string }
```

### Lo que el backend espera

```typescript
POST /api/auth/login
{ email: string, password: string }
```

**Match perfecto en request.**

### Lo que Expo espera recibir

```typescript
{
  access_token: string;
  refresh_token: string;
  user: { id, name, email, role, status }
}
```

### Lo que el backend responde

```typescript
{
  ok: true,
  request_id: string,
  access_token: string,
  refresh_token: string,
  user: { id, email, full_name, role },
  campaigns: [{ id, name, slug, role }]
}
```

### Cambios necesarios en Expo

| Cambio | Archivo | Detalle |
|--------|---------|---------|
| Mapear `full_name` a `name` | `lib/api.ts` o `lib/app-context.tsx` | El backend usa `full_name`, Expo usa `name` |
| Almacenar `campaigns[]` | `lib/auth-store.ts` + `lib/app-context.tsx` | El backend devuelve campaigns en login — guardarlas |
| El backend no devuelve `status` en login | `lib/types.ts` | Asumir `active` si login exitoso, o hacer GET `/api/auth/me` despues |
| Manejar errores nuevos | `app/(auth)/login.tsx` | Backend devuelve `AUTH_USER_SUSPENDED`, `AUTH_USER_PENDING` (no solo 401) |

### Mapeo de `AuthUser` (Expo) vs backend response

```typescript
// Expo espera:
type AuthUser = { id, name, email, role, status }

// Backend devuelve en login:
{ id, email, full_name, role }
// Backend devuelve en /auth/me:
{ id, email, full_name, role, status }

// Adaptador:
function mapUser(backendUser: any): AuthUser {
  return {
    id: backendUser.id,
    name: backendUser.full_name,
    email: backendUser.email,
    role: backendUser.role,
    status: backendUser.status ?? 'active',
  };
}
```

---

## 3. Auth — Register

### Lo que Expo envia hoy

```typescript
POST /api/auth/register
{ name: string, email: string, phone: string, password: string }
```

### Lo que el backend espera

```typescript
POST /api/auth/register
{ email: string, password: string, full_name: string }
```

### Cambios necesarios en Expo

| Cambio | Archivo | Detalle |
|--------|---------|---------|
| Mapear `name` -> `full_name` | `app/(auth)/register.tsx` o `lib/api.ts` | El backend usa `full_name` |
| Quitar `phone` del request | `lib/api.ts` | Backend no acepta `phone` (validacion Zod va a rechazarlo como campo extra si `strict`) |
| Adaptar respuesta | `lib/types.ts` | Backend devuelve `{ user: { id, email, full_name, role, status } }`, no `{ id, status, message }` |

**Alternativa:** Agregar `phone` al schema de registro del backend. Si se necesita el telefono del agente, es mejor agregarlo ahi.

---

## 4. Auth — Refresh

### Lo que Expo envia hoy

```typescript
POST /api/auth/refresh
{ refresh_token: string }
```

### Lo que el backend espera

Identico. **Match perfecto.**

### Lo que Expo espera recibir

```typescript
{ access_token: string, refresh_token: string }
```

### Lo que el backend responde

```typescript
{ ok: true, request_id: string, access_token: string, refresh_token: string }
```

### Cambio necesario

El wrapper `ok` no es problema porque `lib/api.ts` ya parsea el JSON completo. Solo asegurar que el extractor lea `.access_token` y `.refresh_token` del body (no de un sub-objeto). **Probablemente ya funciona** — verificar.

---

## 5. Auth — Me (status check)

### Lo que Expo llama

```typescript
GET /api/auth/me
Authorization: Bearer <token>
```

### Lo que el backend responde

```typescript
{
  ok: true,
  request_id: string,
  user: { id, email, full_name, role, status },
  campaigns: [{ id, name, slug, role }]
}
```

### Cambios en Expo

El polling de `pending.tsx` llama `checkUserStatus()` que espera `{ status }`. El backend devuelve `{ user: { status } }`. Hay que extraer `response.user.status` en vez de `response.status`.

---

## 6. App Config — EL CAMBIO MAS GRANDE

### Problema

La app Expo llama `GET /api/app-config` al hacer login exitoso. **Este endpoint no existe en el backend.**

El concepto de "app config" en Expo es:

```typescript
type AppConfig = {
  candidate: CandidateConfig;
  agent: AgentConfig;
  form: FormConfig;
}
```

Donde:
- `candidate` = datos del candidato (nombre, foto, colores, partido)
- `agent` = datos del agente logueado (nombre, email, permisos)
- `form` = definicion del formulario a llenar (campos dinamicos)

### Solucion: Componer config desde endpoints existentes

En vez de crear un endpoint nuevo, la app puede componer el config desde endpoints que ya existen:

```
1. POST /api/auth/login → user + campaigns[]
2. GET /api/candidates → lista de candidatos activos (PUBLIC)
3. GET /api/form-definitions/active?campaign_id=X → formularios del candidato
4. GET /api/form-definitions/:id → schema completo de un formulario
```

### Flujo propuesto para Expo post-login

```
Login exitoso
  → Guardar tokens + user + campaigns
  → Si campaigns.length === 0:
      → Pantalla "Seleccionar candidato" (GET /api/candidates)
      → POST /api/access-requests (pedir acceso)
      → Ir a pantalla "Pendiente de aprobacion"
  → Si campaigns.length === 1:
      → Usar esa campaign automaticamente
      → GET /api/form-definitions/active?campaign_id=X
      → Armar AppConfig con los datos
  → Si campaigns.length > 1:
      → Pantalla "Seleccionar campana"
      → Despues mismo flujo que arriba
```

### Adaptador para construir AppConfig

```typescript
async function buildAppConfig(
  user: AuthUser,
  campaign: { id, name, slug, role },
  candidateData: CandidateFromAPI,
  formDefs: FormDefinitionFromAPI[]
): AppConfig {
  return {
    candidate: {
      id: campaign.id,
      name: campaign.name,
      slug: campaign.slug,
      cargo: candidateData.cargo ?? '',
      numero: candidateData.numero ?? 0,
      partido: candidateData.partido ?? '',
      foto_url: candidateData.foto_url ?? null,
      color_primario: '#1B2A4A',    // default hasta que backend tenga colores
      color_secundario: '#FFD700',   // default
    },
    agent: {
      id: user.id,
      name: user.name,
      email: user.email,
      perm_tierra: true,
      perm_digital: true,
    },
    form: formDefs.length > 0
      ? {
          id: formDefs[0].id,
          name: formDefs[0].name,
          fields: formDefs[0].schema.fields,
        }
      : null,
  };
}
```

### Endpoints del backend que ya cubren esto

| Dato | Endpoint | Auth |
|------|----------|------|
| Candidatos disponibles | `GET /api/candidates` | Public |
| Campaigns del usuario | Viene en login response y en `GET /api/auth/me` | JWT |
| Form definitions activas | `GET /api/form-definitions/active?campaign_id=X` | JWT |
| Form definition completa | `GET /api/form-definitions/:id` | JWT |

---

## 7. Forms — Submission

### Lo que Expo envia hoy

```typescript
POST /api/registros
Authorization: Bearer <token>
{
  form_id: string,
  data: Record<string, unknown>,
  ubicacion_utm: { zone, hemisphere, easting, northing, datum_epsg } | null,
  fecha: string  // ISO 8601
}
```

### Lo que el backend espera

```typescript
POST /api/forms
x-agent-id: <device_uuid>
{
  nombre: string,
  telefono: string,
  fecha: string,        // ISO 8601
  x: number,            // UTM easting (100000-900000)
  y: number,            // UTM northing (1-10000000)
  zona: string,
  candidate: string,
  encuestador: string,
  encuestador_id: string,
  candidato_preferido: string,
  client_id: string,    // UUID unico por form (idempotencia)
  campaign_id?: string, // UUID de la campaign
  form_definition_id?: string,
  home_maps_url?: string,
  polling_place_url?: string,
  comentarios?: string
}
```

### Gap critico

La Expo envia formularios **dinamicos** (campos definidos por config), pero el backend espera un schema **fijo** con campos hardcodeados (`nombre`, `telefono`, `zona`, etc.).

### Opciones de solucion

**Opcion A: Adaptar Expo para mapear campos dinamicos a campos fijos del backend**

Si los formularios siempre van a tener los mismos campos base, Expo puede extraer los valores del `data` dinamico y mapearlos al schema fijo:

```typescript
function buildFormPayload(
  formData: Record<string, unknown>,
  ubicacion: UTMResult | null,
  config: AppConfig
): BackendFormPayload {
  return {
    nombre: String(formData['nombre_entrevistado'] ?? formData['nombre'] ?? ''),
    telefono: String(formData['telefono'] ?? ''),
    fecha: new Date().toISOString(),
    x: ubicacion?.easting ?? 0,
    y: ubicacion?.northing ?? 0,
    zona: String(formData['zona'] ?? config.candidate.name),
    candidate: config.candidate.name,
    encuestador: config.agent.name,
    encuestador_id: config.agent.id,
    candidato_preferido: String(formData['candidato_preferido'] ?? ''),
    client_id: crypto.randomUUID(),  // generar una vez, NO regenerar en retry
    campaign_id: config.candidate.id,
    form_definition_id: config.form?.id,
    home_maps_url: String(formData['home_maps_url'] ?? ''),
    polling_place_url: String(formData['polling_place_url'] ?? ''),
    comentarios: String(formData['comentarios'] ?? ''),
  };
}
```

**Opcion B: Evolucionar el backend para aceptar forms dinamicos**

Agregar un endpoint `POST /api/forms/dynamic` que acepte:

```typescript
{
  campaign_id: string,
  form_definition_id: string,
  data: Record<string, unknown>,
  location?: { lat, lng, accuracy },
  client_id: string,
  agent_id: string,
  submitted_at: string
}
```

**Recomendacion: Opcion A primero (rapido, no rompe nada), Opcion B despues como evolucion.**

### Headers adicionales requeridos

El backend usa `x-agent-id` para rate limiting de forms:

```typescript
headers: {
  'Content-Type': 'application/json',
  'x-agent-id': deviceUUID,  // estable por dispositivo
}
```

Expo necesita generar y persistir un device UUID estable (en SecureStore o AsyncStorage).

### Batch submission

El backend soporta `POST /api/forms/batch` con un array de forms. Util para flush de cola offline:

```typescript
POST /api/forms/batch
x-agent-id: <device_uuid>
[
  { ...form1 },
  { ...form2 },
  ...
]
```

---

## 8. Forms — Listado (dashboard)

### Lo que Expo llama hoy

```typescript
GET /api/registros
Authorization: Bearer <token>
```

### Estado del backend

No existe un endpoint `GET /api/registros`. El backend tiene la tabla `forms` pero no expone un endpoint de listado para agentes.

### Opciones

**Opcion A (rapida):** Agregar `GET /api/forms?agent_id=X` al backend que devuelva los forms del agente.

**Opcion B (local-first):** El dashboard muestra los forms desde la cola local (SQLite). Los forms enviados exitosamente se marcan como `synced`. No necesita endpoint de listado.

**Recomendacion: Opcion B** — es mas resiliente y no requiere cambio de backend. El dashboard lee de SQLite local y muestra el status de sync.

---

## 9. Access Requests

### Lo que Expo envia para listar

```typescript
GET /api/access-requests
Authorization: Bearer <token>
```

### Backend

```typescript
GET /api/access-requests  // admin only — lista todas
GET /api/access-requests/mine  // usuario logueado — lista las suyas
GET /api/access-requests/pending  // admin only — lista pendientes
```

### Cambio en Expo

- Para admin en `solicitudes.tsx`: usar `GET /api/access-requests/pending` (no el generico)
- Para agentes que quieren ver sus propias: usar `GET /api/access-requests/mine`

### Lo que Expo envia para aprobar/rechazar

```typescript
PUT /api/access-requests/:id
{ action: "approve" | "reject" }
```

### Lo que el backend espera

```typescript
PUT /api/access-requests/:requestId
{ status: "approved" | "rejected", note?: string }
```

### Cambio en Expo

Renombrar `action` a `status` y mapear valores:

```typescript
// Antes:
{ action: "approve" }

// Despues:
{ status: "approved" }
```

---

## 10. GPS Tracking — Implementacion completa (nueva)

### Estado actual

No existe ningun codigo de tracking en la Expo. Hay que construirlo desde cero.

### Backend contract

```typescript
POST /api/agents/location
Headers:
  Content-Type: application/json
  x-agent-token: <AGENT_INGEST_TOKEN>  // token estatico, NO JWT

Body:
{
  agent_id: string,       // device UUID estable
  ts: string,             // ISO 8601
  lat: number,            // -90 a 90
  lng: number,            // -180 a 180
  accuracy?: number,      // >= 0
  speed?: number,         // >= 0
  heading?: number,       // 0 a 359.999
  battery?: number,       // 0 a 100
  seq: number,            // entero >= 0, monotono creciente
  campaign_id?: string    // UUID de la campaign activa
}
```

### Respuestas

| Status | Significado | Accion en Expo |
|--------|-------------|----------------|
| 202 | Aceptado | OK, incrementar seq |
| 200 | Deduplicado | OK, no hacer nada |
| 401 | Token invalido | Alertar, detener tracking |
| 429 | Rate limited | Retry con backoff |
| 503 | Backpressure | Retry con backoff |
| 400 | Payload invalido | No reintentar, loggear error |

### Implementacion requerida en Expo

**Archivos a crear:**

```
lib/
  tracking/
    tracking-service.ts      # Logica principal de tracking
    tracking-store.ts         # Persistencia de seq + cola
    location-task.ts          # Background task (expo-task-manager)
    battery.ts                # Leer nivel de bateria
```

**Flujo:**

```
App en foreground
  → requestForegroundPermissionsAsync()
  → Si concedido: iniciar watchPositionAsync() con distanceInterval
  → Cada location event:
      → Construir payload con seq++
      → Intentar POST /api/agents/location
      → Si falla: encolar en SQLite para retry

App en background
  → requestBackgroundPermissionsAsync()
  → Registrar TaskManager.defineTask('TRACKING_TASK')
  → startLocationUpdatesAsync('TRACKING_TASK', { ... })
  → En el task: mismo flujo pero batch los puntos
```

**Seq management:**

```typescript
// Persistir ultimo seq en AsyncStorage
const SEQ_KEY = `tracking_seq_${agentId}`;

async function getNextSeq(): Promise<number> {
  const current = await AsyncStorage.getItem(SEQ_KEY);
  const next = (parseInt(current ?? '0', 10)) + 1;
  await AsyncStorage.setItem(SEQ_KEY, String(next));
  return next;
}
```

**Headers (NO usa JWT, usa token estatico):**

```typescript
import Constants from 'expo-constants';

const INGEST_TOKEN = Constants.expoConfig?.extra?.EXPO_PUBLIC_AGENT_INGEST_TOKEN;

const headers = {
  'Content-Type': 'application/json',
  'x-agent-token': INGEST_TOKEN,
};
```

---

## 11. Offline Queue (nueva)

### Dependencias ya instaladas (no usadas)

- `expo-sqlite` v16 — para cola local
- `expo-network` v8 — para detectar conectividad
- `expo-task-manager` v14 — para background sync

### Esquema SQLite sugerido

```sql
CREATE TABLE IF NOT EXISTS form_queue (
  id TEXT PRIMARY KEY,           -- client_id (UUID)
  payload TEXT NOT NULL,          -- JSON del form
  status TEXT DEFAULT 'pending',  -- pending | syncing | synced | failed
  attempts INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  synced_at TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS tracking_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload TEXT NOT NULL,           -- JSON del location point
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
```

### Flush strategy

```
Cada 30 segundos (o en connectivity change):
  → Si hay red:
      → Forms: SELECT * FROM form_queue WHERE status = 'pending' LIMIT 10
        → POST /api/forms/batch con el array
        → Si 202: UPDATE status = 'synced'
        → Si 429/503: backoff, reintentar
        → Si 400: UPDATE status = 'failed', guardar error
      → Tracking: SELECT * FROM tracking_queue WHERE status = 'pending' ORDER BY id LIMIT 50
        → Enviar uno por uno (no hay batch endpoint para tracking)
        → Si 202/200: DELETE FROM tracking_queue
```

---

## 12. Roles y permisos

### Backend roles

| Role | Nivel | Puede en Expo |
|------|-------|---------------|
| `agent` | 10 | Llenar forms, tracking GPS |
| `supervisor` | 20 | Todo de agent + ver agentes asignados |
| `admin` | 30 | Todo + gestionar access requests |

### Expo roles actuales

```typescript
type UserRole = 'agent' | 'operator' | 'admin' | 'candidate';
```

### Discrepancia

- Expo tiene `operator` y `candidate`. Backend tiene `supervisor`.
- **Mapeo sugerido:** `operator` en Expo = `supervisor` en backend. `candidate` en Expo no existe en backend (candidato es una campaign, no un usuario).

### Cambio en Expo

```typescript
// Antes:
type UserRole = 'agent' | 'operator' | 'admin' | 'candidate';

// Despues (alineado con backend):
type UserRole = 'agent' | 'supervisor' | 'admin';
```

Eliminar `candidate` como role de usuario. El candidato es metadata de la campaign, no un role.

---

## 13. Campaign scoping

### Concepto

Todo en el backend esta aislado por `campaign_id`. El backend usa el header `X-Campaign-Id` para scoping en endpoints protegidos que lo requieran.

### Cambio en Expo

Cuando el usuario selecciona una campaign, guardarla en estado y enviarla en los headers:

```typescript
// En lib/api.ts, agregar al request():
if (activeCampaignId) {
  headers['X-Campaign-Id'] = activeCampaignId;
}
```

Tambien enviar `campaign_id` en el body de forms y tracking.

---

## 14. Error handling estandar

### Formato de error del backend

```typescript
{
  ok: false,
  request_id: string,
  code: string,
  message: string
}
```

### Codigos de error que Expo debe manejar

| Code | Status | Accion en Expo |
|------|--------|----------------|
| `VALIDATION_ERROR` | 400 | Mostrar mensaje al usuario |
| `AUTH_INVALID_CREDENTIALS` | 401 | "Credenciales invalidas" |
| `AUTH_USER_SUSPENDED` | 403 | Ir a pantalla suspended |
| `AUTH_USER_PENDING` | 403 | Ir a pantalla pending |
| `AUTH_TOKEN_EXPIRED` | 401 | Auto-refresh (ya implementado) |
| `AUTH_TOKEN_INVALID` | 401 | Borrar tokens, ir a login |
| `AUTH_REFRESH_REVOKED` | 401 | Borrar tokens, ir a login (posible ataque) |
| `AUTH_EMAIL_EXISTS` | 409 | "Email ya registrado" |
| `ACCESS_REQUEST_DUPLICATE` | 409 | "Ya solicitaste acceso" |
| `CAMPAIGN_NOT_FOUND` | 404 | "Campana no encontrada" |
| `INVALID_TOKEN` | 401 | Token de tracking invalido |
| `TRACKING_BACKPRESSURE` | 503 | Retry con backoff |

### Cambio en Expo

`lib/api.ts` ya maneja errores, pero necesita extraer `code` del body:

```typescript
// En el catch de request():
const errorBody = await response.json();
return {
  ok: false,
  error: errorBody.message ?? 'Error desconocido',
  code: errorBody.code,
  status: response.status,
};
```

---

## 15. Retry policy

### Reglas (heredadas de EXPO_AUTH_CONTRACT.md)

- Retry solo en `429`, `503` o error de red
- Backoff: `1-2s`, `3-5s`, `8-13s` con jitter
- Maximo: 5 intentos
- Si 401 `AUTH_TOKEN_EXPIRED`: refresh + reintentar (no cuenta como retry)
- Si 401 cualquier otro: no reintentar, ir a Login
- Si 400: no reintentar nunca (payload invalido)

### Implementacion sugerida

```typescript
async function withRetry<T>(
  fn: () => Promise<ApiResult<T>>,
  maxRetries = 5
): Promise<ApiResult<T>> {
  const delays = [1500, 4000, 10000, 20000, 40000]; // con jitter

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await fn();

    if (result.ok) return result;
    if (result.status === 400 || result.status === 401 || result.status === 403) {
      return result; // no reintentar
    }
    if (result.status === 429 || result.status === 503 || !result.status) {
      if (attempt < maxRetries) {
        const base = delays[Math.min(attempt, delays.length - 1)];
        const jitter = Math.random() * base * 0.3;
        await sleep(base + jitter);
        continue;
      }
    }
    return result;
  }
}
```

---

## 16. Resumen de cambios por archivo (Expo)

### lib/api.ts

| # | Cambio | Prioridad |
|---|--------|-----------|
| 1 | Leer `API_BASE` de `Constants.expoConfig.extra` | P0 |
| 2 | Agregar header `X-Campaign-Id` cuando hay campaign activa | P1 |
| 3 | Agregar header `x-agent-id` para forms | P1 |
| 4 | Cambiar `POST /api/registros` -> `POST /api/forms` | P0 |
| 5 | Cambiar payload de forms (ver seccion 7) | P0 |
| 6 | Cambiar `GET /api/registros` -> lectura local SQLite o nuevo endpoint | P1 |
| 7 | Cambiar `PUT /api/access-requests/:id` payload: `action` -> `status` | P1 |
| 8 | Agregar `GET /api/candidates` (public) | P1 |
| 9 | Agregar `GET /api/form-definitions/active?campaign_id=X` | P1 |
| 10 | Agregar `POST /api/agents/location` (tracking, con `x-agent-token`) | P2 |
| 11 | Extraer `code` de errores del backend | P1 |

### lib/app-context.tsx

| # | Cambio | Prioridad |
|---|--------|-----------|
| 1 | Eliminar `GET /api/app-config` | P0 |
| 2 | Componer config desde login response + candidates + form-definitions | P0 |
| 3 | Mapear `full_name` -> `name` en user | P0 |
| 4 | Agregar estado de `activeCampaign` y selector de campaign | P1 |
| 5 | Agregar `campaigns` al estado | P0 |

### lib/auth-store.ts

| # | Cambio | Prioridad |
|---|--------|-----------|
| 1 | Agregar key `goberna_campaigns` para persistir campaigns | P1 |
| 2 | Agregar key `goberna_active_campaign_id` | P1 |
| 3 | Agregar key `goberna_device_uuid` (generar una vez, nunca cambiar) | P1 |

### lib/types.ts

| # | Cambio | Prioridad |
|---|--------|-----------|
| 1 | Cambiar `UserRole` a `'agent' \| 'supervisor' \| 'admin'` | P0 |
| 2 | Eliminar `RegisterRequest.phone` o moverlo a backend | P1 |
| 3 | Cambiar `RegisterResponse` para matchear backend | P0 |
| 4 | Agregar tipos: `Campaign`, `FormDefinition`, `Candidate` | P1 |
| 5 | Agregar tipo `TrackingPayload` | P2 |

### app/(auth)/register.tsx

| # | Cambio | Prioridad |
|---|--------|-----------|
| 1 | Enviar `full_name` en vez de `name` | P0 |
| 2 | Decidir si quitar campo `phone` o agregar al backend | P1 |

### app/(auth)/pending.tsx

| # | Cambio | Prioridad |
|---|--------|-----------|
| 1 | Extraer status de `response.user.status` (no `response.status`) | P0 |

### app/(main)/new-form.tsx

| # | Cambio | Prioridad |
|---|--------|-----------|
| 1 | Construir payload de forms segun schema backend (ver seccion 7) | P0 |
| 2 | Generar `client_id` UUIDv4 al abrir form (NO regenerar en retry) | P0 |
| 3 | Enviar `x-agent-id` header | P1 |
| 4 | Guardar en SQLite local antes de enviar (offline-first) | P2 |

### app/(main)/solicitudes.tsx

| # | Cambio | Prioridad |
|---|--------|-----------|
| 1 | Usar `GET /api/access-requests/pending` para admin | P1 |
| 2 | Enviar `{ status: "approved" }` en vez de `{ action: "approve" }` | P0 |

### Archivos NUEVOS a crear

| Archivo | Proposito | Prioridad |
|---------|-----------|-----------|
| `lib/tracking/tracking-service.ts` | Servicio de tracking GPS | P2 |
| `lib/tracking/location-task.ts` | Background location task | P2 |
| `lib/offline/form-queue.ts` | Cola offline para forms (SQLite) | P2 |
| `lib/offline/db.ts` | Setup de SQLite | P2 |
| `lib/device.ts` | Device UUID generation + persistence | P1 |
| `app/(main)/select-campaign.tsx` | Selector de campana (si > 1) | P1 |

---

## 17. Orden de implementacion recomendado

### Fase 1: Conectar auth (1-2 dias)

1. Leer API_BASE de env
2. Mapear `full_name` <-> `name`
3. Adaptar register request
4. Adaptar error codes
5. Eliminar dependencia de `/api/app-config`
6. Componer config desde login + candidates + form-definitions
7. Alinear roles (`supervisor` en vez de `operator`)

### Fase 2: Conectar forms (1-2 dias)

8. Cambiar endpoint y payload de forms
9. Generar device UUID estable
10. Generar client_id por form
11. Adaptar access requests
12. Dashboard: decidir listado local vs endpoint

### Fase 3: Tracking GPS (2-3 dias)

13. Implementar tracking service (foreground)
14. Implementar background tracking
15. Seq management
16. Retry con backoff

### Fase 4: Offline (2-3 dias)

17. Setup SQLite
18. Form queue (save -> sync)
19. Tracking queue
20. Network state detection
21. Background sync task

---

## 18. Endpoints completos del backend (referencia)

### Auth

| Method | Endpoint | Auth | Expo usa |
|--------|----------|------|----------|
| POST | `/api/auth/login` | No | Si |
| POST | `/api/auth/register` | No | Si |
| POST | `/api/auth/refresh` | No | Si |
| POST | `/api/auth/logout` | JWT | Si |
| POST | `/api/auth/change-password` | JWT | No (futuro) |
| GET | `/api/auth/me` | JWT | Si |

### Campaigns / Candidates

| Method | Endpoint | Auth | Expo usa |
|--------|----------|------|----------|
| GET | `/api/candidates` | No (public) | Si |
| GET | `/api/campaigns` | JWT | No (web) |
| POST | `/api/campaigns` | JWT + admin | No (web) |
| GET | `/api/campaigns/:id` | JWT + campaign | No (web) |
| PUT | `/api/campaigns/:id` | JWT + admin/supervisor | No (web) |
| POST | `/api/campaigns/:id/members` | JWT + admin | No (web) |
| DELETE | `/api/campaigns/:id/members/:userId` | JWT + admin | No (web) |

### Form Definitions

| Method | Endpoint | Auth | Expo usa |
|--------|----------|------|----------|
| GET | `/api/form-definitions` | JWT + admin/supervisor | No (web) |
| GET | `/api/form-definitions/active?campaign_id=X` | JWT | Si |
| GET | `/api/form-definitions/:id` | JWT | Si |
| POST | `/api/form-definitions` | JWT + admin | No (web) |
| PUT | `/api/form-definitions/:id` | JWT + admin | No (web) |
| DELETE | `/api/form-definitions/:id` | JWT + admin | No (web) |

### Forms (submission)

| Method | Endpoint | Auth | Expo usa |
|--------|----------|------|----------|
| POST | `/api/forms` | x-agent-id | Si |
| POST | `/api/forms/batch` | x-agent-id | Si (offline flush) |

### Access Requests

| Method | Endpoint | Auth | Expo usa |
|--------|----------|------|----------|
| POST | `/api/access-requests` | JWT | Si |
| GET | `/api/access-requests/mine` | JWT | Si |
| GET | `/api/access-requests/pending` | JWT + admin | Si |
| GET | `/api/access-requests` | JWT + admin | No (usar pending) |
| PUT | `/api/access-requests/:requestId` | JWT + admin | Si |

### Tracking

| Method | Endpoint | Auth | Expo usa |
|--------|----------|------|----------|
| POST | `/api/agents/location` | x-agent-token | Si |
| GET | `/api/agents/live` | JWT | No (web) |
| GET | `/api/agents/stream` | JWT (SSE) | No (web) |
| GET | `/api/agents/health` | No | No (ops) |

### Health / Ops

| Method | Endpoint | Auth | Expo usa |
|--------|----------|------|----------|
| GET | `/api/health` | No | No |
| GET | `/api/ready` | No | No |
| GET | `/api/metrics` | No | No |

---

## 19. Tokens y secretos

| Token | Donde viene | Donde se guarda en Expo | Para que |
|-------|-------------|------------------------|----------|
| `access_token` (JWT) | `POST /api/auth/login` | SecureStore `goberna_access_token` | Header `Authorization: Bearer` |
| `refresh_token` | `POST /api/auth/login` | SecureStore `goberna_refresh_token` | Body de `POST /api/auth/refresh` |
| `AGENT_INGEST_TOKEN` | `app.json` extra / `eas.json` | Leido de `Constants.expoConfig.extra` | Header `x-agent-token` para tracking |
| `device_uuid` | Generado localmente | SecureStore `goberna_device_uuid` | Header `x-agent-id` para forms + `agent_id` para tracking |

**NUNCA** guardar tokens JWT en AsyncStorage. Solo SecureStore.

---

## 20. Checklist de validacion

Cuando todo este integrado, verificar:

- [ ] Login con credenciales reales devuelve tokens y user
- [ ] Refresh automatico funciona (esperar 15min o forzar token vencido)
- [ ] Register crea usuario con status `pending`
- [ ] Pending screen detecta cuando admin aprueba
- [ ] Config se compone desde candidates + form-definitions
- [ ] Formulario se renderiza desde form definition del backend
- [ ] Submit de form llega a `POST /api/forms` y se guarda
- [ ] `client_id` previene duplicados
- [ ] Access requests se listan y se pueden aprobar/rechazar
- [ ] GPS tracking envia a `/api/agents/location` con token correcto
- [ ] Seq se incrementa correctamente y persiste entre reinicios
- [ ] Formularios se guardan en SQLite cuando no hay red
- [ ] Formularios se sincronizan cuando vuelve la red
- [ ] Rate limiting (429) se maneja con backoff
- [ ] Cerrar sesion limpia tokens de SecureStore

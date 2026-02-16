# GOBERNA — Contrato de Autenticacion (Backend ↔ Expo App)

**Version**: 1.0  
**Fecha**: 2026-02-16  
**Base URL**: `https://api.goberna.pe` (produccion) | `http://localhost:3000` (dev)

---

## Principios generales

1. **Autenticacion JWT**: El backend emite `access_token` (corta vida, ~15min) y `refresh_token` (larga vida, ~7 dias).
2. **Bearer tokens**: Todos los endpoints protegidos requieren `Authorization: Bearer <access_token>`.
3. **Refresh automatico**: Cuando el `access_token` expira (401), usar `/api/auth/refresh` con el `refresh_token`.
4. **Campaign scope**: Endpoints de datos (forms, tracking) requieren header `x-campaign-id: <uuid>` para multi-tenant.
5. **Tracking especial**: `/api/agents/location` usa `x-agent-token` (no JWT) para ingesta rapida desde dispositivos de campo.

---

## Endpoints de autenticacion

### 1. `POST /api/auth/login`

Inicio de sesion con email/password.

#### Request

```json
{
  "email": "admin@goberna.pe",
  "password": "Admin1234!"
}
```

**Campos:**
- `email` (string, required): Email del usuario (case-insensitive, trimmed)
- `password` (string, required): Contraseña en plaintext

#### Response (200 OK)

```json
{
  "ok": true,
  "request_id": "req_abc123",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@goberna.pe",
    "full_name": "Administrador GOBERNA",
    "role": "admin",
    "status": "active"
  },
  "campaigns": [
    {
      "id": "c50e8400-e29b-41d4-a716-446655440001",
      "name": "Guillermo Aliaga",
      "slug": "guillermo-aliaga",
      "role": "admin"
    }
  ]
}
```

**Campos de respuesta:**
- `access_token` (string): JWT para autenticacion inmediata (Bearer). Expira en ~15min.
- `refresh_token` (string): JWT para renovar access_token. Expira en ~7 dias.
- `user.id` (uuid): ID unico del usuario
- `user.email` (string): Email del usuario
- `user.full_name` (string): Nombre completo
- `user.role` (enum): `"admin"` | `"supervisor"` | `"agent"`
- `user.status` (enum): `"active"` | `"suspended"` | `"pending"`
- `campaigns[]`: Array de campañas a las que el usuario tiene acceso
- `campaigns[].id` (uuid): ID de la campaña
- `campaigns[].name` (string): Nombre de la campaña/candidato
- `campaigns[].slug` (string): Slug URL-friendly
- `campaigns[].role` (enum): Rol del usuario en esa campaña (`"admin"` | `"supervisor"` | `"agent"`)

#### Response (401 Unauthorized)

```json
{
  "ok": false,
  "request_id": "req_abc123",
  "code": "AUTH_INVALID_CREDENTIALS",
  "message": "email o password incorrectos"
}
```

#### Response (400 Bad Request)

```json
{
  "ok": false,
  "request_id": "req_abc123",
  "code": "VALIDATION_ERROR",
  "message": "email invalido, password requerido"
}
```

#### Errores posibles
- `400 VALIDATION_ERROR` — Email o password invalidos/faltantes
- `401 AUTH_INVALID_CREDENTIALS` — Credenciales incorrectas
- `403 AUTH_USER_SUSPENDED` — Usuario suspendido
- `403 AUTH_USER_PENDING` — Usuario pendiente de activacion
- `500 INTERNAL_ERROR` — Error del servidor

---

### 2. `POST /api/auth/refresh`

Renueva el `access_token` usando el `refresh_token`.

#### Request

```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Campos:**
- `refresh_token` (string, required): JWT de refresh obtenido en login

#### Response (200 OK)

```json
{
  "ok": true,
  "request_id": "req_abc124",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Campos:**
- `access_token` (string): Nuevo JWT de acceso
- `refresh_token` (string): Nuevo JWT de refresh (rotacion automatica)

#### Response (401 Unauthorized)

```json
{
  "ok": false,
  "request_id": "req_abc124",
  "code": "AUTH_INVALID_REFRESH_TOKEN",
  "message": "refresh token invalido o expirado"
}
```

#### Errores posibles
- `400 VALIDATION_ERROR` — refresh_token faltante
- `401 AUTH_INVALID_REFRESH_TOKEN` — Token invalido/expirado/revocado
- `500 INTERNAL_ERROR` — Error del servidor

---

### 3. `GET /api/auth/me`

Obtiene informacion del usuario autenticado.

#### Request

**Headers:**
```
Authorization: Bearer <access_token>
```

#### Response (200 OK)

```json
{
  "ok": true,
  "request_id": "req_abc125",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@goberna.pe",
    "full_name": "Administrador GOBERNA",
    "role": "admin",
    "status": "active"
  },
  "campaigns": [
    {
      "id": "c50e8400-e29b-41d4-a716-446655440001",
      "name": "Guillermo Aliaga",
      "slug": "guillermo-aliaga",
      "role": "admin"
    }
  ]
}
```

**Campos:** Identicos a `/api/auth/login` (sin tokens).

#### Response (401 Unauthorized)

```json
{
  "ok": false,
  "request_id": "req_abc125",
  "code": "AUTH_UNAUTHORIZED",
  "message": "token invalido o expirado"
}
```

#### Errores posibles
- `401 AUTH_UNAUTHORIZED` — Token faltante/invalido/expirado
- `404 USER_NOT_FOUND` — Usuario no existe (caso raro)
- `500 INTERNAL_ERROR` — Error del servidor

---

### 4. `POST /api/auth/logout`

Cierra sesion (invalida refresh token).

#### Request

**Headers:**
```
Authorization: Bearer <access_token>
```

**Body:** (vacio o `{}`)

#### Response (200 OK)

```json
{
  "ok": true,
  "request_id": "req_abc126"
}
```

#### Errores posibles
- `401 AUTH_UNAUTHORIZED` — Token invalido
- `500 INTERNAL_ERROR` — Error del servidor

**Nota:** Aunque el logout falle, el cliente debe borrar los tokens localmente.

---

### 5. `POST /api/auth/register`

Registro de nuevos usuarios (auto-registro abierto en dev/produccion controlado por admin).

#### Request

```json
{
  "email": "nuevo@ejemplo.com",
  "password": "MiPassword123",
  "full_name": "Juan Perez"
}
```

**Campos:**
- `email` (string, required): Email valido, unico
- `password` (string, required): Min 8 caracteres
- `full_name` (string, required): Nombre completo (max 200 chars)

#### Response (201 Created)

```json
{
  "ok": true,
  "request_id": "req_abc127",
  "user": {
    "id": "650e8400-e29b-41d4-a716-446655440002",
    "email": "nuevo@ejemplo.com",
    "full_name": "Juan Perez",
    "role": "agent",
    "status": "active"
  }
}
```

**Campos:**
- `user` (objeto): Usuario creado (sin tokens, debe hacer login despues)

**Nota:** Usuario recien registrado **no tiene** acceso a campañas. Debe solicitar acceso via onboarding web o admin debe asignarlo manualmente.

#### Response (409 Conflict)

```json
{
  "ok": false,
  "request_id": "req_abc127",
  "code": "AUTH_EMAIL_EXISTS",
  "message": "email ya registrado"
}
```

#### Errores posibles
- `400 VALIDATION_ERROR` — Email invalido, password corto, nombre vacio
- `409 AUTH_EMAIL_EXISTS` — Email ya existe
- `500 INTERNAL_ERROR` — Error del servidor

---

### 6. `POST /api/auth/change-password`

Cambia la contraseña del usuario autenticado.

#### Request

**Headers:**
```
Authorization: Bearer <access_token>
```

**Body:**
```json
{
  "current_password": "Admin1234!",
  "new_password": "NuevoAdmin456!"
}
```

**Campos:**
- `current_password` (string, required): Contraseña actual
- `new_password` (string, required): Nueva contraseña (min 8 caracteres)

#### Response (200 OK)

```json
{
  "ok": true,
  "request_id": "req_abc128"
}
```

#### Response (401 Unauthorized)

```json
{
  "ok": false,
  "request_id": "req_abc128",
  "code": "AUTH_INVALID_CREDENTIALS",
  "message": "password actual incorrecta"
}
```

#### Errores posibles
- `400 VALIDATION_ERROR` — Campos faltantes/invalidos
- `401 AUTH_UNAUTHORIZED` — Token invalido
- `401 AUTH_INVALID_CREDENTIALS` — Password actual incorrecta
- `500 INTERNAL_ERROR` — Error del servidor

---

## Endpoints de campañas (publico/auth)

### 7. `GET /api/candidates`

**PUBLICO** — Lista candidatos activos (para pantalla de registro/onboarding).

#### Request

**Headers:** (ninguno requerido)

#### Response (200 OK)

```json
{
  "ok": true,
  "request_id": "req_abc129",
  "candidates": [
    {
      "id": "c50e8400-e29b-41d4-a716-446655440001",
      "name": "Guillermo Aliaga",
      "slug": "guillermo-aliaga",
      "cargo": "Senador Nacional",
      "numero": 1,
      "partido": "Somos Peru",
      "foto_url": "/2guillermo.jpg"
    },
    {
      "id": "c50e8400-e29b-41d4-a716-446655440002",
      "name": "Rocio Porras",
      "slug": "rocio-porras",
      "cargo": "Senadora Nacional",
      "numero": 4,
      "partido": "Somos Peru",
      "foto_url": "/Rocio-Porras.jpg"
    }
  ]
}
```

**Campos:**
- `candidates[]`: Array de candidatos activos
- `id` (uuid): ID de la campaña
- `name` (string): Nombre del candidato
- `slug` (string): Slug URL-friendly
- `cargo` (string | null): Cargo al que se postula
- `numero` (number | null): Numero de lista
- `partido` (string | null): Partido politico
- `foto_url` (string | null): URL de la foto (relativa o absoluta)

---

## Endpoints protegidos de datos (requieren JWT + campaign scope)

### 8. `POST /api/forms`

Envia un formulario de encuesta (protegido, requiere JWT + campaign_id).

#### Request

**Headers:**
```
Authorization: Bearer <access_token>
x-campaign-id: c50e8400-e29b-41d4-a716-446655440001
```

**Body:**
```json
{
  "actor_id": "agent_123",
  "latitude": -12.0464,
  "longitude": -77.0428,
  "form_type": "encuesta_satisfaccion",
  "answers": {
    "pregunta_1": "Muy satisfecho",
    "pregunta_2": 5
  },
  "metadata": {
    "device_id": "abc-def-123",
    "app_version": "1.0.0"
  }
}
```

**Campos:**
- `actor_id` (string, required): ID del agente (email o UUID)
- `latitude` (number, required): -90 a 90
- `longitude` (number, required): -180 a 180
- `form_type` (string, required): Tipo de formulario
- `answers` (object, required): Respuestas clave-valor
- `metadata` (object, optional): Metadata adicional

#### Response (200 OK)

```json
{
  "ok": true,
  "request_id": "req_abc130",
  "form_id": "f50e8400-e29b-41d4-a716-446655440003",
  "outcome": "accepted"
}
```

**Campos:**
- `form_id` (uuid): ID del formulario creado
- `outcome` (enum): `"accepted"` (ok) | `"rejected_duplicate"` (dedup) | `"rejected_rate_limit"` (429)

#### Errores posibles
- `400 VALIDATION_ERROR` — Campos invalidos
- `401 AUTH_UNAUTHORIZED` — Token invalido
- `403 CAMPAIGN_FORBIDDEN` — Sin acceso a la campaña especificada
- `429 RATE_LIMIT_EXCEEDED` — Demasiadas requests (rate limit)
- `500 INTERNAL_ERROR` — Error del servidor

---

### 9. `POST /api/agents/location`

**Tracking especial** — Ingesta de ubicacion con `x-agent-token` (no JWT).

#### Request

**Headers:**
```
x-agent-token: <AGENT_INGEST_TOKEN de env>
x-campaign-id: c50e8400-e29b-41d4-a716-446655440001
```

**Body:**
```json
{
  "actor_id": "agent@ejemplo.com",
  "latitude": -12.0464,
  "longitude": -77.0428,
  "accuracy": 10.5,
  "heading": 180.0,
  "speed": 5.2,
  "timestamp": "2026-02-16T18:30:00Z"
}
```

**Campos:**
- `actor_id` (string, required): Email o ID del agente
- `latitude` (number, required): -90 a 90
- `longitude` (number, required): -180 a 180
- `accuracy` (number, optional): Precision en metros
- `heading` (number, optional): Direccion en grados (0-360)
- `speed` (number, optional): Velocidad en m/s
- `timestamp` (string ISO8601, optional): Timestamp del evento (auto si omitido)

#### Response (200 OK)

```json
{
  "ok": true,
  "request_id": "req_abc131",
  "outcome": "accepted"
}
```

**Campos:**
- `outcome` (enum): `"accepted"` | `"rejected_duplicate"` | `"rejected_rate_limit"`

#### Errores posibles
- `400 VALIDATION_ERROR` — Coordenadas invalidas
- `401 AUTH_INVALID_TOKEN` — x-agent-token invalido
- `403 CAMPAIGN_REQUIRED` — Falta x-campaign-id
- `429 RATE_LIMIT_EXCEEDED` — Rate limit
- `500 INTERNAL_ERROR` — Error del servidor

---

## Flujo completo recomendado (Expo App)

### 1. Login inicial

```typescript
const response = await fetch("https://api.goberna.pe/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "admin@goberna.pe",
    password: "Admin1234!",
  }),
});

const data = await response.json();

if (data.ok) {
  // Guardar en AsyncStorage
  await AsyncStorage.setItem("access_token", data.access_token);
  await AsyncStorage.setItem("refresh_token", data.refresh_token);
  await AsyncStorage.setItem("user", JSON.stringify(data.user));
  await AsyncStorage.setItem("campaigns", JSON.stringify(data.campaigns));
  
  // Seleccionar campaña por defecto (primera)
  const defaultCampaign = data.campaigns[0];
  await AsyncStorage.setItem("active_campaign_id", defaultCampaign.id);
}
```

### 2. Requests autenticados

```typescript
const accessToken = await AsyncStorage.getItem("access_token");
const campaignId = await AsyncStorage.getItem("active_campaign_id");

const response = await fetch("https://api.goberna.pe/api/forms", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessToken}`,
    "x-campaign-id": campaignId,
  },
  body: JSON.stringify({ /* form data */ }),
});

if (response.status === 401) {
  // Token expirado → refresh
  await refreshToken();
  // Retry request
}
```

### 3. Refresh token automatico

```typescript
async function refreshToken() {
  const refreshToken = await AsyncStorage.getItem("refresh_token");
  
  const response = await fetch("https://api.goberna.pe/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const data = await response.json();

  if (data.ok) {
    await AsyncStorage.setItem("access_token", data.access_token);
    await AsyncStorage.setItem("refresh_token", data.refresh_token);
    return true;
  } else {
    // Refresh falló → logout + redirigir a login
    await logout();
    return false;
  }
}
```

### 4. Logout

```typescript
async function logout() {
  const accessToken = await AsyncStorage.getItem("access_token");
  
  // Intentar invalidar en backend (no bloqueante)
  try {
    await fetch("https://api.goberna.pe/api/auth/logout", {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
  } catch {
    // Ignorar errores
  }

  // Limpiar storage local (critico)
  await AsyncStorage.multiRemove([
    "access_token",
    "refresh_token",
    "user",
    "campaigns",
    "active_campaign_id",
  ]);
  
  // Redirigir a login
}
```

### 5. Tracking de ubicacion (background)

```typescript
import * as Location from "expo-location";

const AGENT_TOKEN = "tu-token-de-env"; // Desde config
const campaignId = await AsyncStorage.getItem("active_campaign_id");
const user = JSON.parse(await AsyncStorage.getItem("user"));

Location.watchPositionAsync(
  {
    accuracy: Location.Accuracy.High,
    timeInterval: 30000, // 30 seg
    distanceInterval: 50, // 50 metros
  },
  async (location) => {
    await fetch("https://api.goberna.pe/api/agents/location", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-token": AGENT_TOKEN,
        "x-campaign-id": campaignId,
      },
      body: JSON.stringify({
        actor_id: user.email,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        heading: location.coords.heading,
        speed: location.coords.speed,
        timestamp: new Date(location.timestamp).toISOString(),
      }),
    });
  }
);
```

---

## Codigos de error comunes

| Codigo | HTTP | Descripcion |
|--------|------|-------------|
| `VALIDATION_ERROR` | 400 | Campos invalidos/faltantes |
| `AUTH_INVALID_CREDENTIALS` | 401 | Email/password incorrectos |
| `AUTH_UNAUTHORIZED` | 401 | Token invalido/expirado/faltante |
| `AUTH_INVALID_REFRESH_TOKEN` | 401 | Refresh token invalido |
| `AUTH_INVALID_TOKEN` | 401 | x-agent-token invalido |
| `AUTH_USER_SUSPENDED` | 403 | Usuario suspendido |
| `AUTH_USER_PENDING` | 403 | Usuario pendiente |
| `CAMPAIGN_FORBIDDEN` | 403 | Sin acceso a la campaña |
| `CAMPAIGN_REQUIRED` | 403 | Falta header x-campaign-id |
| `USER_NOT_FOUND` | 404 | Usuario no existe |
| `CAMPAIGN_NOT_FOUND` | 404 | Campaña no existe |
| `AUTH_EMAIL_EXISTS` | 409 | Email ya registrado |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit excedido |
| `INTERNAL_ERROR` | 500 | Error del servidor |

---

## Notas de implementacion

1. **Tokens en AsyncStorage**: Guardar `access_token`, `refresh_token`, `user`, `campaigns`, `active_campaign_id`.
2. **Auto-refresh**: Interceptar 401 globalmente, refresh automatico, retry request 1 vez.
3. **Campaign selection**: Si usuario tiene multiples campañas, mostrar selector. Guardar `active_campaign_id` y enviar en header.
4. **Tracking background**: Usar `expo-location` con `TaskManager` para tracking en background. Rate limit por defecto: 1 location cada 30seg.
5. **Offline queue**: Considerar queue local (AsyncStorage o SQLite) para forms/tracking cuando offline. Enviar cuando vuelva conexion.
6. **AGENT_INGEST_TOKEN**: Token estatico de env, compartido por todos los agentes. Rotarlo periodicamente en produccion.
7. **HTTPS obligatorio en produccion**: No enviar tokens por HTTP no encriptado.

---

## Credenciales de desarrollo

Ver `CREDENCIALES.md` en root del proyecto.

**Admin:** `admin@goberna.pe` / `Admin1234!`

---

## Entorno de pruebas local

### 1. Usando Docker Compose (recomendado)

```bash
# En root del proyecto
cp .env.example .env  # Ajustar variables
docker-compose up -d postgres redis backend

# Esperar a que postgres este healthy
docker-compose logs -f backend

# Seed de datos
docker-compose exec backend bun run seed
```

### 2. Backend standalone (dev)

```bash
cd apps/backend

# Crear .env
cat > .env <<EOF
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/goberna_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-change-in-production-minimum-32-chars-long
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_ROUNDS=10
AGENT_INGEST_TOKEN=dev-agent-token-change-in-production
PORT=3000
NODE_ENV=development
EOF

# Instalar deps + seed
bun install
bun run migrate
bun run seed

# Levantar
bun run dev
```

### 3. Verificar que funciona

```bash
# Health check
curl http://localhost:3000/api/health

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@goberna.pe","password":"Admin1234!"}'

# Deberia retornar access_token + user + campaigns
```

### 4. Frontend (opcional para probar flujo completo)

```bash
cd nexus-web
npm install
npm run dev
# Abre http://localhost:3001/login
```

---

## Verificacion de integracion (Expo)

1. **Confirmar endpoint base**: Usar `https://api.goberna.pe` en produccion o `http://<tu-ip-local>:3000` en dev (no `localhost` desde dispositivo fisico).
2. **Probar login**: Llamar `/api/auth/login` con credenciales de admin desde Postman/curl/Expo.
3. **Verificar JWT**: Decodificar access_token en [jwt.io](https://jwt.io) — debe tener `sub`, `email`, `role`, `campaign_ids`.
4. **Probar refresh**: Usar refresh_token obtenido para renovar access_token.
5. **Probar tracking**: Enviar ubicacion a `/api/agents/location` con x-agent-token y x-campaign-id.
6. **Probar forms**: Enviar formulario a `/api/forms` con Bearer token y x-campaign-id.

Si todos estos pasos funcionan → integracion lista para Expo.

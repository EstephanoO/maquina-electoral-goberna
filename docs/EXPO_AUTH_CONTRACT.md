# Contrato Expo - Auth, Tracking y Forms

Estado: vigente. Complementa `NUEVO_CONTRATO_EXPO.md` agregando el flujo de autenticacion.

Base URL produccion: `https://API_DOMAIN`

---

## 1) Flujo completo de la app

```
App abre
  -> Hay refresh_token guardado?
     NO  -> Pantalla Login
     SI  -> POST /api/auth/refresh
            OK  -> Guardar nuevos tokens, ir a Home
            401 -> Borrar tokens, ir a Login

Login
  -> POST /api/auth/login
     OK  -> Guardar access_token + refresh_token en SecureStore
         -> Guardar user + campaigns en estado local
         -> Ir a Home

Home (con sesion)
  -> GET /api/auth/me (opcional, para refrescar perfil)
  -> Iniciar tracking GPS
  -> Formularios disponibles segun campaign

Cualquier request autenticada
  -> Header: Authorization: Bearer <access_token>
  -> Si responde 401 AUTH_TOKEN_EXPIRED:
     -> POST /api/auth/refresh con el refresh_token guardado
        OK  -> Reintentar request original con nuevo access_token
        401 -> Sesion muerta, ir a Login

Logout
  -> POST /api/auth/logout (con Bearer token)
  -> Borrar tokens de SecureStore
  -> Ir a Login
```

---

## 2) Endpoints de Auth

### POST /api/auth/login

Enviar:

```json
{
  "email": "agente@nexus.pe",
  "password": "agent123"
}
```

Headers:

```
Content-Type: application/json
```

Respuesta 200:

```json
{
  "ok": true,
  "request_id": "req-1",
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "a1b2c3d4e5f6...64chars_hex",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "agente@nexus.pe",
    "full_name": "Agente de Campo",
    "role": "agent"
  },
  "campaigns": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "name": "Lima Norte 2026",
      "slug": "lima-norte-2026",
      "role": "agent"
    }
  ]
}
```

Errores posibles:

| Status | Code | Significado | Accion en Expo |
|--------|------|-------------|----------------|
| 400 | `VALIDATION_ERROR` | Email o password vacios/mal formato | Mostrar error en form |
| 401 | `AUTH_INVALID_CREDENTIALS` | Email o password incorrectos | Mostrar "credenciales invalidas" |
| 403 | `AUTH_USER_SUSPENDED` | Cuenta suspendida | Mostrar "cuenta suspendida, contactar admin" |
| 403 | `AUTH_USER_PENDING` | Cuenta pendiente de activacion | Mostrar "cuenta pendiente de activacion" |

---

### POST /api/auth/refresh

Enviar:

```json
{
  "refresh_token": "a1b2c3d4e5f6...el_refresh_token_guardado"
}
```

Headers:

```
Content-Type: application/json
```

Respuesta 200:

```json
{
  "ok": true,
  "request_id": "req-2",
  "access_token": "eyJhbGciOiJIUzI1NiIs...nuevo",
  "refresh_token": "x9y8z7w6...nuevo_refresh_64chars_hex"
}
```

**IMPORTANTE**: El refresh token anterior queda invalidado. Guardar inmediatamente los dos tokens nuevos en SecureStore antes de hacer cualquier otra cosa.

Errores posibles:

| Status | Code | Significado | Accion en Expo |
|--------|------|-------------|----------------|
| 400 | `VALIDATION_ERROR` | Refresh token vacio | Ir a Login |
| 401 | `AUTH_REFRESH_INVALID` | Token no existe | Borrar tokens, ir a Login |
| 401 | `AUTH_REFRESH_REVOKED` | Token reutilizado (posible ataque) | Borrar tokens, ir a Login |
| 401 | `AUTH_REFRESH_EXPIRED` | Token vencido (>7 dias) | Borrar tokens, ir a Login |
| 403 | `AUTH_USER_INACTIVE` | Usuario suspendido o eliminado | Borrar tokens, ir a Login |

---

### POST /api/auth/logout

Headers:

```
Content-Type: application/json
Authorization: Bearer <access_token>
```

Body: vacio o `{}`

Respuesta 200:

```json
{
  "ok": true,
  "request_id": "req-3"
}
```

Errores posibles:

| Status | Code | Significado | Accion en Expo |
|--------|------|-------------|----------------|
| 401 | `AUTH_TOKEN_MISSING` | No se envio Bearer | Ir a Login igual |
| 401 | `AUTH_TOKEN_EXPIRED` | Token vencido | Ir a Login igual (no hace falta refresh para logout) |

---

### GET /api/auth/me

Headers:

```
Authorization: Bearer <access_token>
```

Respuesta 200:

```json
{
  "ok": true,
  "request_id": "req-4",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "agente@nexus.pe",
    "full_name": "Agente de Campo",
    "role": "agent",
    "status": "active"
  },
  "campaigns": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "name": "Lima Norte 2026",
      "slug": "lima-norte-2026",
      "role": "agent"
    }
  ]
}
```

---

## 3) JWT Access Token - Claims

El access_token es un JWT HS256 con estos claims:

```json
{
  "sub": "user_uuid",
  "email": "agente@nexus.pe",
  "role": "agent",
  "campaign_ids": ["campaign_uuid_1", "campaign_uuid_2"],
  "iat": 1739750400,
  "exp": 1739751300
}
```

- Expira en **15 minutos** por defecto
- No almacenar nada sensible basandose en los claims; usarlos solo para UI/UX
- Para datos frescos, usar `/api/auth/me`

---

## 4) Almacenamiento en Expo

| Dato | Donde guardar | Encriptado |
|------|---------------|------------|
| `access_token` | `expo-secure-store` | Si |
| `refresh_token` | `expo-secure-store` | Si |
| `user` (id, email, name, role) | `AsyncStorage` o estado | No (es publica) |
| `campaigns` | `AsyncStorage` o estado | No |

**Nunca** guardar tokens en AsyncStorage, useState o variables globales sin SecureStore.

---

## 5) Tracking (con auth)

Endpoint: `POST /api/agents/location`

Headers:

```
Content-Type: application/json
x-agent-token: <AGENT_INGEST_TOKEN>
```

**NOTA**: Tracking todavia usa `x-agent-token` (token estatico compartido), no JWT. Esto cambiara en una fase futura cuando migremos tracking a auth JWT. Por ahora los dos sistemas coexisten.

Payload:

```json
{
  "agent_id": "device_uuid_estable",
  "ts": "2026-02-16T15:30:00.000Z",
  "lat": -12.0464,
  "lng": -77.0428,
  "accuracy": 10.5,
  "speed": 1.2,
  "heading": 180.0,
  "battery": 85,
  "seq": 42
}
```

| Campo | Tipo | Requerido | Validacion |
|-------|------|-----------|------------|
| `agent_id` | string | si | min 1 char, estable por dispositivo |
| `ts` | string | si | ISO 8601 datetime |
| `lat` | number | si | -90 a 90 |
| `lng` | number | si | -180 a 180 |
| `accuracy` | number | no | >= 0 |
| `speed` | number | no | >= 0 |
| `heading` | number | no | 0 a 359.999 |
| `battery` | number | no | 0 a 100 |
| `seq` | number | si | entero >= 0, monotono creciente |

Respuestas:

| Status | Significado | Accion en Expo |
|--------|-------------|----------------|
| 202 | Aceptado | OK, incrementar seq |
| 200 | Deduplicado | OK, no hacer nada especial |
| 401 | Token invalido | Alertar, detener envio |
| 429 | Rate limited | Retry con backoff |
| 503 | Backpressure | Retry con backoff |
| 400 | Payload invalido | No reintentar, revisar datos |

---

## 6) Forms (con auth)

Endpoints:

- `POST /api/forms` (un formulario)
- `POST /api/forms/batch` (array de formularios)

Headers:

```
Content-Type: application/json
x-agent-id: <device_uuid>
```

**NOTA**: Forms todavia usa `x-agent-id` para rate limiting, no JWT. Misma situacion que tracking.

Payload (un form):

```json
{
  "nombre": "Juan Perez",
  "telefono": "987654321",
  "fecha": "2026-02-16T15:30:00.000Z",
  "x": 277000,
  "y": 8665000,
  "zona": "Lima Norte",
  "candidate": "Candidato A",
  "encuestador": "Maria Lopez",
  "encuestador_id": "enc_uuid",
  "candidato_preferido": "Candidato B",
  "client_id": "form_uuid_unico_idempotente",
  "home_maps_url": "https://maps.google.com/...",
  "polling_place_url": "https://maps.google.com/...",
  "comentarios": "Sin novedad"
}
```

| Campo | Tipo | Requerido | Validacion |
|-------|------|-----------|------------|
| `nombre` | string | si | min 1 |
| `telefono` | string | si | min 1 |
| `fecha` | string | si | ISO 8601 datetime |
| `x` | number | si | 100000 a 900000 (UTM easting) |
| `y` | number | si | 1 a 10000000 (UTM northing) |
| `zona` | string | si | min 1 |
| `candidate` | string | no | default "" |
| `encuestador` | string | si | min 1 |
| `encuestador_id` | string | si | min 1 |
| `candidato_preferido` | string | si | min 1 |
| `client_id` | string | si | UUID unico por form, no regenerar en retry |
| `home_maps_url` | string | no | |
| `polling_place_url` | string | no | |
| `comentarios` | string | no | |

Respuestas:

| Status | Significado | Accion en Expo |
|--------|-------------|----------------|
| 202 | Aceptado | OK |
| 429 | Rate limited | Retry con backoff |
| 503 | Backpressure | Retry con backoff |
| 400 | Payload invalido | No reintentar |
| 413 | Batch muy grande | Partir en batches mas chicos |

---

## 7) Errores globales de auth (cualquier endpoint protegido)

Cuando un endpoint usa `Authorization: Bearer`, estos errores pueden aparecer:

| Status | Code | Significado | Accion en Expo |
|--------|------|-------------|----------------|
| 401 | `AUTH_TOKEN_MISSING` | No se envio header Authorization | Ir a Login |
| 401 | `AUTH_TOKEN_EXPIRED` | Access token vencido | Refresh y reintentar |
| 401 | `AUTH_TOKEN_INVALID` | Token corrupto o firma invalida | Borrar tokens, ir a Login |

Formato de error estandar:

```json
{
  "ok": false,
  "request_id": "req-123",
  "code": "AUTH_TOKEN_EXPIRED",
  "message": "token expirado"
}
```

---

## 8) Retry policy (sin cambios)

- Retry solo en `429`, `503` o error de red
- Backoff: `1-2s`, `3-5s`, `8-13s` con jitter
- Maximo: 5 intentos
- Si 401 `AUTH_TOKEN_EXPIRED`: refresh + reintentar (no cuenta como retry)
- Si 401 cualquier otro: no reintentar, ir a Login

---

## 9) Roles disponibles

| Role | Puede en Expo | Puede en Web |
|------|---------------|--------------|
| `agent` | Tracking GPS, llenar forms | - |
| `supervisor` | Todo de agent + ver agentes asignados | Dashboard basico |
| `admin` | Todo | Todo |

El role viene en `user.role` del login y en el JWT claim `role`.
El role por campaign viene en `campaigns[].role` y puede ser distinto del role global.

---

## 10) Tiempos de expiracion

| Token | Duracion default | Configurable |
|-------|-----------------|--------------|
| Access token (JWT) | 15 minutos | `JWT_ACCESS_EXPIRES_IN` |
| Refresh token | 7 dias | `JWT_REFRESH_EXPIRES_IN` |

---

## 11) Checklist de implementacion Expo

- [ ] SecureStore para access_token y refresh_token
- [ ] Interceptor HTTP que agrega `Authorization: Bearer` a todas las requests
- [ ] Interceptor que detecta 401 `AUTH_TOKEN_EXPIRED` y hace refresh automatico
- [ ] Cola de requests que esperan mientras se hace refresh (no hacer refresh en paralelo)
- [ ] Pantalla de Login con email + password
- [ ] Al iniciar app: verificar si hay refresh_token y validarlo
- [ ] Al hacer logout: borrar SecureStore + POST /api/auth/logout
- [ ] Tracking sigue usando `x-agent-token` (no JWT) por ahora
- [ ] Forms sigue usando `x-agent-id` (no JWT) por ahora
- [ ] `agent_id` para tracking = device UUID estable (no cambia entre sesiones)
- [ ] `client_id` para forms = UUID unico por formulario (no regenerar en retry)
- [ ] `seq` monotono creciente por agent_id (persistir ultimo seq en AsyncStorage)

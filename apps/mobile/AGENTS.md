# AGENTS.md - Mobile App (Expo)

> **Hereda de:** `/AGENTS.md` (root)  
> **Alcance:** Solo `apps/mobile/**`  
> **Ultima actualizacion:** 2026-03-05

---

## Flujo de Desarrollo

Ver `/CONTRIBUTING.md` para el flujo GitHub Flow completo.  
Ver seccion 9 del root `/AGENTS.md` para CI/CD y ramas.

---

## Contexto del Modulo

App movil para agentes de campo en Expo SDK 54 + React Native 0.81.  
Offline-first, captura GPS y formularios, sync cuando hay conectividad.

---

## Arquitectura

```
                    Expo App
  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
  │    Auth      │  │   Tracking   │  │     Formularios      │
  │   Screen     │  │   Service    │  │      Dinamicos       │
  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘
         │                 │                      │
         └─────────┬───────┴──────────────────────┘
                   │
           ┌───────▼───────┐
           │  SQLite Queue │  <- Offline-first storage
           │  (expo-sqlite)│
           └───────┬───────┘
                   │
           ┌───────▼───────┐
           │  Sync Service │  <- Cuando hay conectividad
           └───────┬───────┘
                   │ HTTPS
                   ▼
         Backend (api.goberna.us)
```

---

## Rutas del Codigo

| Concepto | Ruta |
|----------|------|
| App entry | `app/_layout.tsx` |
| Auth screens | `app/(auth)/` |
| Main screens | `app/(main)/` |
| API Client | `lib/api.ts` |
| Auth Store | `lib/auth-store.ts` |
| App Context | `lib/app-context.tsx` |
| Types | `lib/types.ts` |
| Events | `lib/events.ts` |
| UTM utils | `lib/utm.ts` |
| Constants | `lib/constants/` |
| Tracking | `lib/tracking/` |
| Offline Queue | `lib/offline-queue/` |
| Components | `components/` |
| Hooks | `hooks/` |
| Config | `app.json` |

---

## Offline Queue (lib/offline-queue/)

Sistema de persistencia offline-first usando expo-sqlite.

### Tablas SQLite
| Tabla | Proposito |
|-------|-----------|
| `pending_locations` | GPS points esperando sync |
| `pending_forms` | Formularios esperando sync |
| `sync_meta` | Metadata (seq numbers, etc) |

### Flujo de Datos
```
1. Usuario captura GPS/Form
2. queueLocation() / queueForm() → SQLite inmediatamente
3. Sync Service (cada 30s) → detecta conexion → POST al backend
4. Backend procesa → valida + deduplica + persiste
5. Marca como synced en SQLite → limpia registros viejos
```

---

## Background Tracking (lib/tracking/)

Sistema de tracking GPS con soporte foreground y background.

### Modos
| Modo | Intervalo | Precision | Bateria |
|------|-----------|-----------|---------|
| Foreground | 30s | Alta | Media |
| Background | 60s | Balanceada | Baja |

### Permisos Requeridos
- `expo-location` foreground permission (obligatorio)
- `expo-location` background permission (opcional, mejor tracking)
- Notificacion de servicio en Android

---

## Endpoints que Consume

| Endpoint | Auth | Proposito |
|----------|------|-----------|
| `POST /api/auth/login` | Ninguno | Login con email/password |
| `POST /api/auth/refresh` | Ninguno | Renovar tokens |
| `GET /api/auth/me` | JWT | Perfil + campanas |
| `GET /api/campaigns/:id` | JWT | Config de campana |
| `GET /api/form-definitions/active` | JWT | Formularios a mostrar |
| `POST /api/forms` | JWT | Submit individual |
| `POST /api/forms/batch` | JWT | Submit batch offline |
| `POST /api/agents/location` | x-agent-token | Enviar ubicacion GPS |

---

## Reglas de Arquitectura

1. **Offline-first SIEMPRE** - Peru tiene conectividad intermitente
2. **SQLite como source of truth local** - No confiar en memoria
3. **Sync con backoff exponencial** - No saturar cuando hay red
4. **GPS validado server-side** - App es untrusted
5. **SecureStore para tokens** - No AsyncStorage
6. **Batch sync preferido** - Menos requests, mas eficiente

---

## Variables de Entorno

### Configuracion en `app.json` > extra
```json
{
  "EXPO_PUBLIC_BACKEND_API_URL": "https://api.goberna.us/api",
  "EXPO_PUBLIC_AGENT_INGEST_TOKEN": "<valor-via-EAS-secrets>"
}
```

### Desarrollo Local
Para desarrollo local, cambiar temporalmente:
```json
"EXPO_PUBLIC_BACKEND_API_URL": "http://<tu-ip-local>:3001/api"
```

---

## Desarrollo Local

### Setup
```bash
cd apps/mobile
bun install
```

### Comandos
```bash
bun start           # Expo dev server
bun run ios         # Simulador iOS
bun run android     # Emulador Android
bunx tsc --noEmit   # Type check
```

### Requisitos para desarrollo
- Backend corriendo (local o produccion)
- Expo Go en dispositivo fisico, o
- Simulador iOS / Emulador Android

---

## Definition of Done (Mobile)

1. `bunx tsc --noEmit` en verde
2. App inicia sin crash
3. Login funciona (con backend local o prod)
4. GPS se captura y se guarda en queue local
5. Sync funciona cuando hay conexion
6. Si cambia contrato, actualizar root `/AGENTS.md`

---

## Consideraciones Peru

- **Conectividad intermitente** - Zonas rurales sin 4G
- **Dispositivos variados** - Android low-end comun
- **Bateria** - Optimizar GPS polling
- **Datos** - Minimizar transferencia

---

## Comunicacion con Otros Modulos

| Modulo | Relacion |
|--------|----------|
| Backend (`apps/backend`) | Consume API directo `https://api.goberna.us/api` |
| Web (`apps/web`) | Comparte backend, no comunicacion directa |
| Tegola | No consume directamente (sin mapas por ahora) |

---

## Seguridad

- **JWT en SecureStore** - No AsyncStorage
- **Refresh token rotation** - Cada refresh genera nuevo
- **Campaign_id validado server-side** - App no decide permisos
- **GPS validado server-side** - App puede mentir

### Auth Dual-Mode (compatibilidad con backend)

El backend soporta auth dual-mode (ver seccion 10.6 del root `/AGENTS.md`):

- **Mobile usa `Authorization: Bearer`** header — el backend lo prioriza sobre cookies
- **Web usa httpOnly cookies** — transparente, no afecta a mobile
- El endpoint `/api/auth/refresh` acepta `refresh_token` en body JSON (mobile) O en cookie httpOnly (web)
- Mobile SIEMPRE envia `refresh_token` en el body JSON del POST (NO depende de cookies)
- El backend retorna tokens en JSON body + setea cookies — mobile **ignora** las cookies y usa el JSON
- Rate limit en login/register/refresh es per-IP (`RATE_LIMIT_AUTH_PER_MINUTE`, default 10/min)

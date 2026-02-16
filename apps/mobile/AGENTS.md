# AGENTS.md - Mobile App (Expo)

> **Hereda de:** `/AGENTS.md` (root)  
> **Alcance:** Solo `apps/mobile/**`

---

## Contexto del Modulo

App movil para agentes de campo en Expo SDK 54 + React Native 0.81.  
Offline-first, captura GPS y formularios, sync cuando hay conectividad.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                        Expo App                                  │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │    Auth      │  │   Tracking   │  │     Formularios      │   │
│  │   Screen     │  │   Service    │  │      Dinamicos       │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                 │                      │               │
│         └─────────┬───────┴──────────────────────┘               │
│                   │                                              │
│           ┌───────▼───────┐                                      │
│           │  SQLite Queue │  <- Offline-first storage            │
│           │  (expo-sqlite)│                                      │
│           └───────┬───────┘                                      │
│                   │                                              │
│           ┌───────▼───────┐                                      │
│           │  Sync Service │  <- Cuando hay conectividad          │
│           │               │                                      │
│           └───────┬───────┘                                      │
└───────────────────┼──────────────────────────────────────────────┘
                    │
                    │ HTTPS
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
| App entry | `app/_layout.tsx` |
| Auth screens | `app/(auth)/` |
| Main screens | `app/(main)/` |
| API Client | `lib/api.ts` |
| Auth Store | `lib/auth-store.ts` |
| Tracking | `lib/tracking/` |
| Offline Queue | `lib/offline-queue.ts` |
| Config | `app.json` |

---

## Conexion con el Sistema

### Flujo Offline-First
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Agente    │     │    App      │     │   Backend   │
│  (Campo)    │     │  (Expo)     │     │  (Fastify)  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │ Captura GPS       │                   │
       │──────────────────>│                   │
       │                   │                   │
       │                   │ Guardar local     │
       │                   │ (SQLite queue)    │
       │                   │                   │
       │ Llena formulario  │                   │
       │──────────────────>│                   │
       │                   │                   │
       │                   │ Guardar local     │
       │                   │ (SQLite queue)    │
       │                   │                   │
       │                   │   [ Cuando hay    │
       │                   │     conexion ]    │
       │                   │                   │
       │                   │ POST /api/agents/location
       │                   │──────────────────>│
       │                   │                   │
       │                   │ POST /api/forms/batch
       │                   │──────────────────>│
       │                   │                   │
       │                   │  { synced: true } │
       │                   │<──────────────────│
       │                   │                   │
       │                   │ Marcar como sync'd│
       │                   │ en SQLite         │
```

### Endpoints que Consume
| Endpoint | Proposito |
|----------|-----------|
| `POST /api/auth/login` | Login con email/password |
| `POST /api/auth/refresh` | Renovar tokens |
| `GET /api/auth/me` | Perfil + campanas |
| `GET /api/campaigns/:id` | Config de campana |
| `GET /api/form-definitions/active` | Formularios a mostrar |
| `POST /api/forms` | Submit individual |
| `POST /api/forms/batch` | Submit batch offline |
| `POST /api/agents/location` | Enviar ubicacion GPS |

### Conexion con Web
```
Mobile genera datos, Web los visualiza.
No hay comunicacion directa entre apps.

Mobile App                       Web Dashboard
     │                                │
     │ POST /api/forms                │
     │───────────────────┐            │
     │                   │            │
     │ POST /api/agents/ │            │
     │   location        │            │
     │───────────────────┤            │
     │                   │            │
     │              ┌────▼────┐       │
     │              │ Backend │       │
     │              │ (Redis +│       │
     │              │ Postgres│       │
     │              └────┬────┘       │
     │                   │            │
     │                   │ GET /api/agents/live
     │                   │────────────>
     │                   │            │
     │                   │ GET /api/metrics
     │                   │────────────>
```

---

## Reglas de Arquitectura

1. **Offline-first SIEMPRE** - Peru tiene conectividad intermitente
2. **SQLite como source of truth local** - No confiar en memoria
3. **Sync con backoff exponencial** - No saturar cuando hay red
4. **GPS validado server-side** - App es untrusted
5. **SecureStore para tokens** - No localStorage
6. **Batch sync preferido** - Menos requests, mas eficiente

---

## Variables de Entorno

### Configuracion en `app.json`
```json
{
  "expo": {
    "extra": {
      "EXPO_PUBLIC_BACKEND_API_URL": "http://161.132.39.165/api",
      "EXPO_PUBLIC_AGENT_INGEST_TOKEN": "<token-de-produccion>"
    }
  }
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
6. Si cambia contrato, actualizar docs compartidos

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
| Backend (`apps/backend`) | Consume API directo (no proxy) |
| Web (`apps/web`) | Comparte backend, no comunicacion directa |
| Tegola | No consume directamente (sin mapas por ahora) |

---

## Seguridad

- **JWT en SecureStore** - No AsyncStorage
- **Refresh token rotation** - Cada refresh genera nuevo
- **Campaign_id validado server-side** - App no decide permisos
- **GPS validado server-side** - App puede mentir

# Expo App - Contexto de Dominio

> **Prerequisito:** Lee [`AGENTS.md`](../AGENTS.md) primero. Este archivo extiende el contexto global con reglas especificas del dominio mobile.

---

## Identidad

**Repo:** `goberna-territory0.2` (este repo)
**Proposito:** App de campo para agentes territoriales. Captura encuestas, trackea GPS, sincroniza offline-first.
**Runtime:** Expo SDK 54, React Native 0.81.5, TypeScript 5.9 strict
**Navegacion:** Expo Router (file-based, Stack layout)
**Estado:** En desarrollo activo. Auth basica funcional, tracking y forms operativos.

---

## Arquitectura Actual

```
app/                    # Expo Router screens
  _layout.tsx           # Root Stack (carga font, registra background task)
  index.tsx             # Login (nombre + apellido + candidato)
  dashboard.tsx         # Dashboard (lista interviews, sync, tracking)
  new-form.tsx          # Formulario de encuesta (UTM, nombre, telefono)

features/               # Clean Architecture emergente
  auth/
    application/
      use-cases/
        login.use-case.ts  # createLoginSession, hydrateStoredAuth

lib/                    # Capa HTTP
  agent-ingest-api.ts   # POST /agents/location
  backend-api.ts        # fetch wrapper centralizado
  backend-health.ts     # GET /health
  ingest-http.ts        # Clasificadores HTTP, retry, jitter

storage/                # Persistencia local
  agent-identity.ts     # agent_id estable por dispositivo (SecureStore)
  session.ts            # Sesion + perfil (SecureStore)
  tracking-consent.ts   # Consentimiento GPS (SecureStore)
  interview-queue.ts    # Cola offline interviews (SQLite)
  tracking-queue.ts     # Cola offline tracking (SQLite)
  tracking-incidents.ts # Registro de 401s (SQLite)
  app-state-queue.ts    # Cola eventos app state (SQLite)

tracking/               # Subsistema GPS
  foreground-tracking.ts    # watchPositionAsync, 5s/20m thresholds
  background-location-task.ts # TaskManager, 30s interval
  app-state-telemetry.ts    # Sync on foreground/network recovery

shared/config/          # Configuracion centralizada
  app-config.ts         # Singleton config reader
  env-sources.ts        # Lee EXPO_PUBLIC_* vars

constants/
  candidates.ts         # Registro de candidatos (hardcoded hoy)
  theme.ts              # Colores brand + font Montserrat-Bold
```

---

## Estado de Implementacion

### Implementado y Funcional
- Login por nombre + candidato (sin auth server-side)
- Dashboard con lista de interviews, conteos, sync periodico (8s)
- Formulario de encuesta con captura UTM, validacion telefono peruano
- GPS foreground + background con queue SQLite
- Sequence numbers monotonos por agent_id
- Retry con exponential backoff + jitter (1-2s, 3-5s, 8-13s)
- Auth token gating en produccion (x-agent-token)
- Bloqueo 30min por 401 en tracking
- Network-aware sync (reacciona a cambios de conectividad)
- Agent identity estable por dispositivo
- Tracking consent management

### NO Implementado (Pendiente)
- Auth real (email + password contra backend propio)
- JWT access + refresh tokens
- Multi-tenant (campaign_id en requests)
- Formularios dinamicos (JSONB desde backend)
- Zonas GPS (validacion client-side + server-side)
- SSE geovisor (solo documentado en contrato)
- Mapas (MapLibre)
- Design system / componentes reutilizables
- App state telemetry (hook existe pero no se usa)
- Tests para dashboard, storage, tracking, config

### Deuda Tecnica
- `dashboard.tsx` tiene 873 lineas (descomponer en componentes)
- Estilos inline repetidos (no hay design system)
- Colores brand duplicados en cada screen
- Componentes template de Expo sin usar (hello-wave, parallax, etc)
- `auth/` directorio vacio
- `app/(tabs)/` vacio (tabs eliminados del template)
- `credentials.json` con password en plaintext (mover a .env)

---

## Skills Asignados

Cargar estos skills antes de implementar en este dominio:

| Skill | Cuando cargarlo |
|-------|----------------|
| `building-native-ui` | UI: componentes, tabs, animaciones, formularios, navegacion |
| `expo-architect` | Scaffold, estructura de proyecto, configuracion inicial |
| `expo-deployment` | Build, deploy a stores, EAS workflows |
| `expo-tailwind-setup` | Setup NativeWind v5 / Tailwind CSS v4 |
| `react-native-architecture` | Offline-first, state management, performance, patrones RN |
| `tdd-full-coverage` | Escribir tests, TDD workflow, coverage |

Skills de workflow (transversales):
- `brainstorming` -> antes de cualquier feature nueva
- `writing-plans` -> para crear plan de implementacion
- `executing-plans` -> para ejecutar un plan escrito

---

## Restricciones Hard

1. **Offline-first obligatorio.** Todo se guarda en SQLite primero. Sync es best-effort.
2. **No romper lo que funciona.** Tracking y forms ya operan en campo. Cambios son aditivos.
3. **SecureStore para datos sensibles.** JWT, agent_id, session. Nunca en AsyncStorage ni SQLite sin cifrar.
4. **Expo Router file-based.** No usar react-navigation directamente. Screens en `app/`.
5. **Clean Architecture en `features/`.** Use cases separados de UI. Repositorios para storage.
6. **No dependencias innecesarias.** Cada npm package se justifica. Expo SDK first.

---

## Dependencias Clave (Produccion)

| Paquete | Para que |
|---------|----------|
| `expo-sqlite` | Queues offline (interviews, tracking, app-state) |
| `expo-secure-store` | JWT, session, agent-id, consent |
| `expo-location` | GPS foreground + background |
| `expo-task-manager` | Background location task |
| `expo-network` | Detectar conectividad para sync |
| `expo-router` | Navegacion file-based |
| `expo-image` | Imagenes optimizadas |
| `utm` | Conversion lat/lng a UTM |

---

## Patron de Auth (Evolucion)

### Actual (v0 - Operativo)
```
App: nombre + apellido + candidato -> SecureStore
No hay validacion server-side
x-agent-token hardcoded por env para tracking
```

### Target (v1 - Con Backend)
```
App: email + password -> POST /auth/login
Backend: bcrypt verify -> JWT (access 15min + refresh 7d)
App: guarda tokens en SecureStore
App: adjunta Authorization: Bearer <token> en cada request
App: refresh automatico cuando access expira
App: recibe campaign config + zonas + form templates
```

### Futuro (v2 - Google OAuth)
```
App: Google Sign-In -> id_token
Backend: verifica con Google -> busca en allowlist -> JWT
Mismo flujo de refresh que v1
```

---

## Patron de Sync (No Cambiar)

```
1. Evento (interview, GPS point) -> SQLite queue
2. Sync trigger (periodico 8s, network change, screen focus)
3. Leer items pendientes de SQLite
4. POST al backend con retry policy
5. Si 2xx -> marcar como synced en SQLite
6. Si permanent error (400/401/403) -> marcar como failed
7. Si transient error (429/503/network) -> retry con backoff
8. Si max retries excedido -> pending_reconciliation
```

---

## Estructura de Navegacion (Target)

```
app/
  _layout.tsx           # Root: decide auth vs main
  (auth)/               # Grupo auth (sin tabs)
    login.tsx            # Email + password
    register.tsx         # Futuro: registro agente
  (main)/               # Grupo autenticado
    _layout.tsx          # Tabs o Stack principal
    dashboard.tsx        # Dashboard con stats
    new-form.tsx         # Formulario encuesta
    map.tsx              # Futuro: mapa de zona
    profile.tsx          # Futuro: perfil agente
```

---

## Testing

### Tests Existentes (4 archivos)
- `__tests__/login.test.tsx` - Login screen fields + save
- `__tests__/new-form.test.tsx` - Form validation + save
- `__tests__/agent-ingest-api.test.ts` - Headers + auth check
- `__tests__/ingest-http.test.ts` - Status classification + retry

### Tests Faltantes (Criticos)
- `dashboard.tsx` - Sync, lista, conteos
- `storage/*` - Todas las queues SQLite
- `tracking/*` - GPS foreground/background
- `features/auth/*` - Login use case
- `shared/config/*` - Config reader

### Infraestructura de Tests
- Jest + jest-expo preset
- @testing-library/react-native
- Mocks en `jest.setup.js` para: expo-router, expo-constants, expo-image, expo-location, safe-area-context, reanimated, expo-network, expo-secure-store
- Mock custom en `__mocks__/expo-network.js`

---

## Conexion con Backend

Lee [`agents/backend.md`](backend.md) para el contexto del backend.

### Endpoints que la app consume (actuales)
- `POST /api/agents/location` - Tracking GPS
- `POST /api/forms` - Envio de formularios
- `GET /api/health` - Health check

### Endpoints que la app va a consumir (target)
- `POST /auth/login` - Email + password
- `POST /auth/refresh` - Renovar access token
- `POST /auth/logout` - Cerrar sesion
- `GET /campaigns/:id/config` - Config de campana (zonas, forms)
- `POST /campaigns/:id/forms` - Envio con campaign_id
- `POST /campaigns/:id/tracking` - Tracking con campaign_id

# Goberna — Arquitectura del Sistema
> Última actualización: 2026-03-17 | Fuente de verdad técnica

---

## 1. Qué es esto

Plataforma SaaS de operación territorial para campañas políticas en Perú.

**Componentes activos en producción:**

| Componente | Tecnología | Deploy | Estado |
|---|---|---|---|
| Backend API | Fastify + TypeScript + Bun | VPS `161.132.39.165` vía Docker Compose | ✅ Producción |
| Web Dashboard | Next.js 16 + React 19 + Tailwind 4 | Vercel → `dashboard.grupogoberna.com` | ✅ Producción |
| Chrome Extension | Chrome MV3 + esbuild IIFE | Descarga desde `/extension` | ✅ Producción |
| Mobile App | Expo SDK 54 + React Native 0.81 | EAS Build (iOS + Android) | 🟡 Desarrollo |
| PostgreSQL + PostGIS | pg 15 + PostGIS 3.4 | Docker VPS | ✅ Producción |
| Redis 7.4 | Streams + noeviction | Docker VPS | ✅ Producción |
| Tegola | MVT tiles de distritos Perú | Docker VPS | ✅ Producción |

---

## 2. Flujo de tráfico

```
Internet
  │
  ▼
Cloudflare (DNS proxy ON)
  │
  ├─► Vercel ──────────────────────────────► dashboard.grupogoberna.com
  │     └─ Next.js middleware (fail-closed)
  │     └─ proxy /api/* → api.goberna.us
  │
  └─► Nginx (VPS :443) ────────────────────► api.goberna.us
        └─ proxy_pass → backend:3001
        └─ /uploads/ → volumen estático

Backend (Fastify :3001)
  ├─► PostgreSQL :5432 (Docker interno)
  ├─► Redis :6379 (Docker interno)
  └─► Tegola :8080 (Docker interno)
```

**Regla de oro:** El backend NUNCA se expone directo a internet. Siempre va por Nginx → Cloudflare.

---

## 3. Módulos del backend (30 registrados en app.ts)

### Módulos de infraestructura
| Módulo | Prefijo | Descripción |
|---|---|---|
| `health` | `/api/health`, `/api/ready` | Liveness + readiness (DB + Redis + Tegola) |
| `auth` | `/api/auth/*`, `/api/users/*` | Login, register, refresh, JWT, roles |
| `map` | `/api/config`, `/api/tiles/*`, `/api/capabilities`, `/api/geo/*` | Proxy Tegola + reverse geocode |
| `uploads` | `/api/uploads/*` | Archivos estáticos |
| `analytics` | `/api/campaigns/:id/analytics`, `/api/analytics/*` | Datos GA4 por campaña |

### Módulos de campaña
| Módulo | Prefijo | Descripción |
|---|---|---|
| `campaigns` | `/api/campaigns/*`, `/api/candidates` | CRUD campañas + stats + miembros |
| `org-hierarchy` | `/api/org-hierarchy/*` | Árbol organizacional |
| `invitations` | `/api/invitations/*` | Invitaciones por código |
| `access-requests` | `/api/access-requests/*` | Solicitudes de acceso |
| `access-codes` | `/api/access-codes/*` | Códigos de acceso rápido |
| `objectives` | `/api/objectives/*` | Objetivos por zona/usuario |

### Módulos de campo
| Módulo | Prefijo | Descripción |
|---|---|---|
| `forms` | `/api/forms/*` | Formularios legacy (write-behind Redis Streams) |
| `form-submissions` | `/api/form-submissions/*` | Formularios nuevos (JSONB directo) |
| `form-definitions` | `/api/form-definitions/*` | Definiciones de formularios |
| `agents` | `/api/agents/*`, `/ws/tracking` | GPS tracking + WebSocket + SSE |
| `meets` | `/api/meets/*` | Reuniones de campo |
| `zones` | `/api/zones/*` | Zonas geográficas |
| `validacion` | `/api/validacion/*` | Validación de contactos de campo |
| `voluntarios` | `/api/voluntarios/*` | Registro de voluntarios |
| `regional-leaders` | `/api/regional-leaders/*` | Líderes regionales (registro público) |

### Módulos de comunicación
| Módulo | Prefijo | Descripción |
|---|---|---|
| `cms` | `/api/cms/*` | CRM de contactos + SSE realtime |
| `twilio` | `/api/twilio/*`, `/api/webhooks/twilio/*` | WhatsApp via Twilio |
| `conversations` | `/api/conversations/*` | Historial de conversaciones WA |
| `leads` | `/api/leads/*` | Leads con notificación Telegram |
| `support` | `/api/support/*` | Soporte interno |

### Módulos de inteligencia / extensión Chrome
| Módulo | Prefijo | Descripción |
|---|---|---|
| `ai` | `/api/ai/*` | Gemini proxy: clasificación + spam-check |
| `voter-profiles` | `/api/voter-profiles/*` | Perfiles unificados de votante |
| `audio-catalog` | `/api/audio-catalog[/*]`, `/api/audio-catalog-categories[/*]` | Catálogo de audios TTS (ElevenLabs) |
| `blast` | `/api/blast/*` | Call center masivo WA (6 celulares) |
| `wa-validator` | `/api/wa-validator/*` | Validación de números WA sin mensajes |
| `qr-leads` | `/api/qr-leads/*` | QR por brigadista + tracking de scans |

---

## 4. Extensión Chrome — arquitectura

La extensión corre en **3 contextos diferentes** que se comunican por mensajes:

```
┌─────────────────────────────────────────────────┐
│  WA Web (world: MAIN)                           │
│  inject.js ← esbuild IIFE de src/inject-entry  │
│                                                 │
│  window.require('WAWeb...')  ← módulos WA      │
│  window.postMessage(...)     → content.js       │
└───────────────────┬─────────────────────────────┘
                    │ window.postMessage
                    ▼
┌─────────────────────────────────────────────────┐
│  content.js (world: ISOLATED)                   │
│  Bridge entre inject ↔ background               │
│                                                 │
│  window.addEventListener('message')             │
│  chrome.runtime.sendMessage(...)                │
│  chrome.tabs.sendMessage(...)                   │
└───────────────────┬─────────────────────────────┘
                    │ chrome.runtime.sendMessage
                    ▼
┌─────────────────────────────────────────────────┐
│  background.js (Service Worker)                 │
│  esbuild IIFE de src/background-entry           │
│                                                 │
│  apiFetch() → api.goberna.us                    │
│  chrome.storage.local/session                   │
└─────────────────────────────────────────────────┘
```

### Regla crítica — live bindings en esbuild IIFE

esbuild en modo IIFE snapshot los valores de `export let` en el momento de la compilación. Para compartir estado mutable entre módulos inject, usar **funciones getter**:

```js
// ❌ INCORRECTO — el consumidor recibe null siempre
export let _lastActiveChatJid = null;

// ✅ CORRECTO — el consumidor llama la función y obtiene el valor actual
let _lastActiveChatJid = null;
export function getLastActiveChatJid() { return _lastActiveChatJid; }
```

---

## 5. Mobile — arquitectura offline-first

```
Brigadista captura GPS/formulario
          │
          ▼
SQLite local (expo-sqlite) ← siempre funciona sin red
  pending_locations / pending_forms / sync_meta
          │
          ▼ (SyncService cada 30s, si hay red)
POST /api/agents/location (batch)
POST /api/forms/batch
          │
          ▼
Backend: dedup (Redis Lua) → Redis Stream → PostgreSQL
          │
          ▼
Marca synced en SQLite, limpia viejos
```

**Auth mobile:** tokens en `expo-secure-store`, refresh via body JSON (no cookies), `Bearer` header en cada request.

---

## 6. Convenciones de código

### Backend
- Un módulo = un directorio con `routes.ts` + `repository.ts` + `schemas.ts`
- Handlers delgados: validación Zod → call repository → respuesta standard
- `{ ok: true, request_id, ...data }` / `{ ok: false, request_id, code, message }`
- Config centralizada: leer `env` de `config/env.ts`, nunca `process.env` directamente
- `authorize({ roles: ["candidato"], requireCampaign: true })` para RBAC

### Extensión
- Build: `node build.js` → `inject.js` + `background.js`
- Zip para distribución: `node zip.js` → `apps/web/public/whatsapp-helper.zip`
- Módulos WA Web: siempre con fallbacks (`_requireAny('ModA', 'ModB', 'ModC')`)
- Estado mutable compartido: exportar getters, nunca `export let`
- Versión: actualizar `manifest.json` + `package.json` + página `/extension` juntos

### Web
- Rutas del dashboard: protegidas por `middleware.ts` fail-closed
- Rutas públicas nuevas: agregar explícitamente a `PUBLIC_PATHS` en `middleware.ts`
- Tokens: nunca en localStorage, solo httpOnly cookies
- SSE: reconexión con backoff exponencial (máx 30s), nunca intervalo fijo

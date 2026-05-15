# Cuaderno de Campo — Fase 1: Mobile SQLite-first + App Store

**Fecha:** 2026-05-15
**Estado:** Diseño aprobado — pendiente revisión de spec
**Alcance:** Fase 1 de 3. Fases 2 y 3 son specs separados.

---

## 1. Contexto y problema

`apps/mobile` (Expo SDK 54, React Native 0.81, expo-router) es hoy un app de
agentes de campaña: los brigadistas llenan formularios dinámicos sobre votantes.
Está **unlisted** en el App Store. El dueño del producto quiere pivotearlo a una
**plataforma de canvassing abierta**: cualquier persona se registra y la usa,
sin necesidad de pertenecer a una campaña.

Tres audits (data layer, canvassing UX, App Store) y un audit de infra de mapas
en VPS1 convergen en: el app está ~80% listo a nivel infraestructura, pero está
**hard-gated** por `auth.status === 'active'`, que exige membresía de campaña
(`apps/mobile/app/(main)/_layout.tsx:21`). Sin campaña no hay app.

El proyecto completo son 4 sub-proyectos entrelazados. Para no specearlos como
uno solo, se decomponen en 3 fases. **Este spec cubre solo la Fase 1.**

### Decomposición en fases

- **Fase 1 (este spec):** Mobile SQLite-first + App Store listed. Cambios de
  backend mínimos y aislados (demo bypass + account deletion). Cero migración de
  datos. El app funciona 100% local. Es el unblocker de negocio.
- **Fase 2 (spec separado):** Migración `form_submissions` → tabla `contacts`
  canónica + backend API de contacts + sync mobile↔cloud.
- **Fase 3 (spec separado):** Campaign mode — ranking, features de equipo.

### Principio rector

**Un solo modelo de "contacto", no dos.** El schema SQLite local de Fase 1 se
diseña ya con la forma canónica final. En Fase 2, el sync es un upsert columna a
columna sin capa de traducción. Esto evita fragmentar el ecosistema de las 63k
filas que ya existen en `form_submissions`.

---

## 2. Objetivos y criterios de éxito

Fase 1 termina cuando:

1. Un usuario nuevo abre el app, hace login con phone OTP, y entra a un cuaderno
   de canvassing funcional **sin necesidad de access_code de campaña**.
2. Puede crear, ver, editar, buscar y borrar contactos — todo local SQLite.
3. Cada contacto tiene estado (apoya/duda/no/no-está), nota, foto opcional y
   recordatorio opcional (notificación local).
4. Hay un mapa MapLibre con los contactos como pins coloreados por estado.
5. El app se puede actualizar OTA vía EAS Update sin subir build nuevo.
6. Apple aprueba el app para **listed status** (demo bypass, account deletion,
   privacy policy, rename, permisos).

### Fuera de alcance (Fase 2/3)

- Sync de contactos a la nube.
- Migración de `form_submissions`.
- Ranking / leaderboard / features de equipo.
- Sync de fotos (las fotos quedan local-only en Fase 1).
- Form dinámico server-driven (se retira del mobile; queda para web admin).

---

## 3. Arquitectura

### 3.1 Estado de auth (simplificado)

Se elimina `needs_campaign` como estado bloqueante. La máquina de estados queda:

```
loading → unauthenticated → active
```

`active` ya no exige campaña. `auth.status === 'active'` significa solo "hay un
user autenticado". El `(main)/_layout.tsx` deja de retornar `null` por falta de
campaña.

### 3.2 Estructura de screens `(main)`

```
app/(main)/
  _layout.tsx          Tabs: Contactos | Mapa | Follow-ups | Perfil
  contacts.tsx         REFACTOR de dashboard.tsx — lista + búsqueda + chips estado
  contact/[id].tsx     NUEVO — detalle / edición de un contacto
  add-contact.tsx      REFACTOR de new-form.tsx — form de schema fijo (corto)
  map.tsx              NUEVO — MapLibre Native + pins por estado
  reminders.tsx        NUEVO — follow-ups (notificaciones locales)
  profile.tsx          NUEVO — perfil + link-campaña (placeholder) + delete account
```

**Se borra:** `solicitudes.tsx`, `qr-code.tsx`, `ranking.tsx`.
**Se reusa:** `lib/auth-store.ts`, `lib/api.ts`, `lib/app-context.tsx` (cambios
chicos), `lib/offline-queue/db.ts` (se extiende), `lib/data/peru-distritos.json`,
`components/dashboard/DashboardHeader.tsx` (reskin liviano), tema/colors.

### 3.3 Dependencias nuevas

- `@maplibre/maplibre-react-native` — mapa (mismo stack que la carta web).
- `expo-notifications` — recordatorios locales.
- `expo-image-picker` — foto del contacto (cámara o galería).

> Nota: estas tres traen código nativo. Agregar la dependencia obliga a un build
> nuevo (no OTA). Una vez en el binario, los cambios de JS sí van por OTA.

---

## 4. Modelo de datos (SQLite — forma canónica)

Tabla nueva en `lib/offline-queue/db.ts`. **Este shape es idéntico al futuro
schema cloud de Fase 2** — sync sin traducción.

```sql
CREATE TABLE contacts (
  id                TEXT PRIMARY KEY,      -- uuidv4 generado en el device
  name              TEXT NOT NULL,
  phone             TEXT,                  -- nullable; formato PE validado en UI
  ubigeo            TEXT,                  -- código distrito 6 dígitos (soft FK)
  distrito_nombre   TEXT,                  -- denormalizado para display offline
  lat               REAL,
  lng               REAL,
  estado            TEXT NOT NULL DEFAULT 'duda',  -- apoya|duda|no|no_esta
  note              TEXT,
  photo_uri         TEXT,                  -- path file:// local; no sincroniza P1
  reminder_at       INTEGER,               -- epoch ms; null = sin recordatorio
  reminder_notif_id TEXT,                  -- id de la notif local programada
  created_at        INTEGER NOT NULL,      -- epoch ms
  updated_at        INTEGER NOT NULL,      -- epoch ms
  deleted_at        INTEGER,               -- soft delete (epoch ms); null = activo
  campaign_id       TEXT,                  -- null = personal; se setea en Fase 2
  agent_id          TEXT,                  -- id del user autenticado
  sync_status       TEXT NOT NULL DEFAULT 'local',  -- local|pending|syncing|synced|failed
  server_id         TEXT                   -- id asignado por backend (Fase 2)
);

CREATE INDEX idx_contacts_estado     ON contacts(estado)      WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_updated    ON contacts(updated_at)  WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_ubigeo     ON contacts(ubigeo)      WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_sync       ON contacts(sync_status);
```

`campaign_id`, `agent_id`, `sync_status`, `server_id` existen ya en Fase 1
aunque el sync no esté activo — así Fase 2 no necesita migración de schema local.

**Borrado:** soft delete (`deleted_at`). Las queries de UI filtran
`deleted_at IS NULL`. El hard-delete físico se hace al confirmar sync de borrado
en Fase 2; en Fase 1 el soft-delete alcanza.

### Capa de acceso

`lib/offline-queue/contacts.ts` — módulo nuevo con CRUD: `createContact`,
`updateContact`, `softDeleteContact`, `getContact`, `listContacts(filter)`,
`searchContacts(query)`, `listWithReminders`. Espeja el patrón de
`lib/offline-queue/forms.ts`.

---

## 5. Pantallas (detalle funcional)

### 5.1 `contacts.tsx` — lista
- Search bar (filtra por name/phone, debounced).
- Chips de filtro por estado: Todos / 🟢 Apoya / 🟡 Duda / 🔴 No / 🔵 No-está.
- Lista virtualizada (FlatList) ordenada por `updated_at` desc.
- Cada row: nombre, distrito, badge de estado, indicador de recordatorio.
- FAB `+` → `add-contact`.
- Empty state con coaching ("Tocá + para registrar tu primer contacto").

### 5.2 `add-contact.tsx` — alta (schema fijo)
- Campos: nombre (req), teléfono (opc, validación PE), distrito (picker con
  `peru-distritos.json` + GPS reverse), estado (selector de 4), nota (opc),
  foto (opc, cámara/galería), recordatorio (opc, date-time picker).
- GPS: captura `lat/lng` con `expo-location`; reverse geocode opcional para
  prellenar distrito.
- Guardar → `createContact` en SQLite → vuelve a la lista. Sin modal post-submit.

### 5.3 `contact/[id].tsx` — detalle / edición
- Muestra todos los campos. Botón editar (mismo form que add). Botón borrar
  (soft delete con confirmación). Acción "WhatsApp" si hay teléfono.

### 5.4 `map.tsx` — mapa
- MapLibre Native. Basemap = tiles vector de Tegola vía
  `GET /api/tiles/{z}/{x}/{y}.vector.pbf` (online; MapLibre cachea).
- Capa GeoJSON de los contactos locales con `lat/lng`, pins coloreados por
  estado. Tap en pin → `contact/[id]`.
- `fitBounds` inicial al extent de los contactos; fallback al bbox de Perú.

### 5.5 `reminders.tsx` — follow-ups
- Lista de contactos con `reminder_at` futuro, ordenada por fecha.
- Sección "vencidos" arriba. Tap → `contact/[id]`.

### 5.6 `profile.tsx` — perfil
- Datos del user (nombre editable, teléfono).
- "Enlazate a una campaña" — input access_code (placeholder visible; el join
  real ya existe vía `joinCampaign`, queda funcional pero opcional).
- Link a Política de Privacidad (web).
- **Eliminar mi cuenta** — confirmación destructiva → `DELETE /api/account` →
  `clearAuthData()` + wipe de SQLite local.
- Logout.

---

## 6. Auth y demo bypass (App Store)

Se mantiene el flow actual: phone → OTP WhatsApp → adentro. El user se
auto-crea en `/whatsapp/verify` (ya implementado).

**Demo bypass para Apple Review:**
- Backend: env `GOBERNA_DEMO_PHONE` (ej `999000001`) y `GOBERNA_DEMO_OTP`
  (ej `123456`).
- En `apps/backend/src/modules/auth/whatsapp-otp.ts` → `sendOtp`: si
  `normalizePhone(phone) === GOBERNA_DEMO_PHONE`, **no** llama al bot; guarda en
  Redis el hash de `GOBERNA_DEMO_OTP` con el mismo TTL.
- `verifyOtp` no cambia — el hash fijo valida normal.
- Cero código frágil en el mobile. El bypass es invisible y vive solo en el
  backend, gateado por env.

---

## 7. Deliverables App Store

| Item | Acción |
|---|---|
| Nombre del app | `app.json` `name` → "Goberna Territorio" (hoy "goberna-territory0.2") |
| Versión | `1.3.0`, buildNumber/versionCode limpios |
| Demo account | Demo bypass (sección 6) + Review Notes en ASC |
| Account deletion | UI en `profile.tsx` + `DELETE /api/account` (Apple 5.1.1v, bloqueante) |
| Privacy policy | Publicar en `goberna.club/privacy`, linkear en `profile.tsx` + ASC |
| Permisos iOS | Agregar `NSCameraUsageDescription` + `NSPhotoLibraryUsageDescription` |
| App Privacy labels | Declarar: location, phone, name/email, contenido de terceros |
| Review Notes | Documentar demo phone + OTP; explicar uso público (no internal-only) |

---

## 8. Cambios de backend (Fase 1 — mínimos, aislados)

Fase 1 **no toca el modelo de datos**. Solo dos cambios aislados:

1. **Demo bypass** en `whatsapp-otp.ts` (sección 6).
2. **`DELETE /api/account`** — endpoint nuevo en el módulo auth: borra el user,
   sus `user_campaigns`, refresh tokens, y cualquier dato propio. Idempotente.
   Devuelve 204. Requiere JWT válido.

Sin migración de schema. Sin endpoints de contacts (eso es Fase 2).

---

## 9. EAS Update (OTA)

`expo-updates` (~29.0.17) ya está en dependencias. Falta configurarlo.

- `app.json`: bloque `updates` (URL del endpoint EAS) + `runtimeVersion` con
  policy `appVersion` o `fingerprint`.
- `eas.json`: canales `production` y `preview` mapeados a branches de update.
- El app chequea updates al lanzar (config por defecto de `expo-updates`).
- **Límite:** OTA actualiza solo JS + assets. Cambios de código nativo (agregar
  MapLibre, notifications, image-picker) exigen build nuevo. El `runtimeVersion`
  gatea la compatibilidad: un bundle OTA solo cae en binarios con el mismo
  runtimeVersion.
- Flujo de release: cambios JS-only → `eas update --branch production`. Cambios
  nativos → `eas build` + submit.

---

## 10. Estrategia de testing (TDD)

Iron Law: ningún código de producción sin un test que falle primero.

- **Unit (jest):**
  - CRUD de `contacts` SQLite (`lib/offline-queue/contacts.ts`).
  - Scheduling/cancelación de recordatorios.
  - Lógica de demo bypass (backend).
  - Filtros y búsqueda de la lista.
- **Integración:**
  - Auth con demo phone end-to-end (send → verify → JWT).
  - Ciclo de vida del contacto (create → edit → soft-delete).
  - `DELETE /api/account` (crea user → borra → 204 → login vuelve a fallar).
- **Backend (bun test):** demo bypass, account deletion.
- **E2E (Maestro — más liviano que Detox para Expo):** add-contact, cambiar
  estado, set reminder, buscar, borrar cuenta.

---

## 11. Subagentes para implementación

- `typescript-pro` / `node-specialist` — mobile RN (screens, SQLite layer).
- `backend-developer` — endpoints demo bypass + account deletion.
- `code-reviewer` — review pre-merge.

---

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Refresh token: cualquier 5xx dispara `clearAuthData()` y expulsa al user (`auth-store.ts:212`) | Fix incluido en Fase 1: 5xx/timeout → no clear; solo 401 explícito limpia sesión. |
| MapLibre Native sin tiles offline en primer uso | Aceptado: un mapa necesita red para tiles. MapLibre cachea tras el primer load. Pins de contactos siempre renderizan (data local). |
| Fotos llenan el almacenamiento del device | Comprimir al capturar (image-picker quality). Sin sync en Fase 1. |
| `maquina_electoral_postgres` (contenedor vacío) confunde | Decomisionar — nada lo referencia (el backend usa `nexus_postgres`). |
| Apple rechaza por 4.2 "internal use" | El pivot a canvassing abierto + demo funcional lo resuelve; Review Notes deben recalcar uso público. |

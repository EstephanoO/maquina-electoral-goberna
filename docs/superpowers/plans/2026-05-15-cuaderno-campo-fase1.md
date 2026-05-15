# Cuaderno de Campo — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `apps/mobile` en un cuaderno de canvassing SQLite-first que funciona sin campaña, con mapa MapLibre, recordatorios y todo lo necesario para App Store listed.

**Architecture:** Refactor in-place. Nueva tabla SQLite `contacts` (forma canónica = futuro schema cloud). Se elimina el gate de campaña en auth. Pantallas: Contactos / Mapa / Follow-ups / Perfil. Backend recibe solo demo-bypass + account-deletion (cero migración). EAS Update para OTA.

**Tech Stack:** Expo SDK 54, React Native 0.81, expo-router, expo-sqlite, `@maplibre/maplibre-react-native`, `expo-notifications`, `expo-image-picker`, expo-updates. Backend Fastify + TS. Tests: jest + @testing-library/react-native (mobile), bun test (backend), Maestro (E2E).

**Spec:** `docs/superpowers/specs/2026-05-15-cuaderno-campo-fase1-design.md`

---

## Grupo A — Foundation (data + auth + backend)

### Task 1: Tabla SQLite `contacts`

**Files:**
- Modify: `apps/mobile/lib/offline-queue/db.ts` (dentro de `initTables`, después del bloque `geo_recientes` en la línea ~166)
- Test: `apps/mobile/lib/offline-queue/__tests__/db-contacts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/offline-queue/__tests__/db-contacts.test.ts
import { getDatabase, closeDatabase } from '../db';

afterEach(async () => { await closeDatabase(); });

test('contacts table exists with canonical columns', async () => {
  const db = await getDatabase();
  const cols = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(contacts)"
  );
  const names = cols.map((c) => c.name).sort();
  expect(names).toEqual([
    'agent_id', 'campaign_id', 'created_at', 'deleted_at', 'distrito_nombre',
    'estado', 'id', 'lat', 'lng', 'name', 'note', 'phone', 'photo_uri',
    'reminder_at', 'reminder_notif_id', 'server_id', 'sync_status',
    'ubigeo', 'updated_at',
  ]);
});

test('contacts indexes exist', async () => {
  const db = await getDatabase();
  const idx = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='contacts'"
  );
  const names = idx.map((i) => i.name);
  expect(names).toEqual(expect.arrayContaining([
    'idx_contacts_estado', 'idx_contacts_updated',
    'idx_contacts_ubigeo', 'idx_contacts_sync',
  ]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && bun jest lib/offline-queue/__tests__/db-contacts.test.ts`
Expected: FAIL — `PRAGMA table_info(contacts)` returns empty.

- [ ] **Step 3: Add the table to `initTables`**

Insertar antes del cierre de `initTables` (después del índice `idx_geo_recientes_used_at`, línea ~166):

```ts
  // Contacts — canvassing notebook (canonical shape, mirrors future cloud schema)
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS contacts (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      phone             TEXT,
      ubigeo            TEXT,
      distrito_nombre   TEXT,
      lat               REAL,
      lng               REAL,
      estado            TEXT NOT NULL DEFAULT 'duda',
      note              TEXT,
      photo_uri         TEXT,
      reminder_at       INTEGER,
      reminder_notif_id TEXT,
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL,
      deleted_at        INTEGER,
      campaign_id       TEXT,
      agent_id          TEXT,
      sync_status       TEXT NOT NULL DEFAULT 'local',
      server_id         TEXT
    );
  `);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS idx_contacts_estado ON contacts(estado) WHERE deleted_at IS NULL;`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS idx_contacts_updated ON contacts(updated_at) WHERE deleted_at IS NULL;`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS idx_contacts_ubigeo ON contacts(ubigeo) WHERE deleted_at IS NULL;`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS idx_contacts_sync ON contacts(sync_status);`);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && bun jest lib/offline-queue/__tests__/db-contacts.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/offline-queue/db.ts apps/mobile/lib/offline-queue/__tests__/db-contacts.test.ts
git commit -m "feat(mobile): tabla SQLite contacts (schema canónico Fase 1)"
```

---

### Task 2: Módulo CRUD `contacts.ts`

**Files:**
- Create: `apps/mobile/lib/offline-queue/contacts.ts`
- Test: `apps/mobile/lib/offline-queue/__tests__/contacts.test.ts`

**Tipos compartidos** (van en `contacts.ts`):

```ts
export type ContactEstado = 'apoya' | 'duda' | 'no' | 'no_esta';

export type Contact = {
  id: string;
  name: string;
  phone: string | null;
  ubigeo: string | null;
  distrito_nombre: string | null;
  lat: number | null;
  lng: number | null;
  estado: ContactEstado;
  note: string | null;
  photo_uri: string | null;
  reminder_at: number | null;
  reminder_notif_id: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  campaign_id: string | null;
  agent_id: string | null;
  sync_status: 'local' | 'pending' | 'syncing' | 'synced' | 'failed';
  server_id: string | null;
};

export type NewContactInput = {
  name: string;
  phone?: string | null;
  ubigeo?: string | null;
  distrito_nombre?: string | null;
  lat?: number | null;
  lng?: number | null;
  estado?: ContactEstado;
  note?: string | null;
  photo_uri?: string | null;
  reminder_at?: number | null;
  agent_id?: string | null;
};
```

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/offline-queue/__tests__/contacts.test.ts
import { closeDatabase, getDatabase } from '../db';
import {
  createContact, getContact, updateContact, softDeleteContact,
  listContacts, searchContacts, listWithReminders,
} from '../contacts';

beforeEach(async () => {
  const db = await getDatabase();
  await db.execAsync('DELETE FROM contacts;');
});
afterEach(async () => { await closeDatabase(); });

test('createContact persists and returns a contact with defaults', async () => {
  const c = await createContact({ name: 'Ana Torres' });
  expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(c.name).toBe('Ana Torres');
  expect(c.estado).toBe('duda');
  expect(c.sync_status).toBe('local');
  expect(c.deleted_at).toBeNull();
  const fetched = await getContact(c.id);
  expect(fetched?.name).toBe('Ana Torres');
});

test('updateContact changes fields and bumps updated_at', async () => {
  const c = await createContact({ name: 'Ana' });
  await new Promise((r) => setTimeout(r, 5));
  const u = await updateContact(c.id, { estado: 'apoya', note: 'voto seguro' });
  expect(u.estado).toBe('apoya');
  expect(u.note).toBe('voto seguro');
  expect(u.updated_at).toBeGreaterThan(c.updated_at);
});

test('softDeleteContact sets deleted_at; list excludes it', async () => {
  const c = await createContact({ name: 'Ana' });
  await softDeleteContact(c.id);
  const fetched = await getContact(c.id);
  expect(fetched?.deleted_at).not.toBeNull();
  const all = await listContacts();
  expect(all.find((x) => x.id === c.id)).toBeUndefined();
});

test('listContacts filters by estado', async () => {
  await createContact({ name: 'A', estado: 'apoya' });
  await createContact({ name: 'B', estado: 'no' });
  const apoya = await listContacts({ estado: 'apoya' });
  expect(apoya).toHaveLength(1);
  expect(apoya[0].name).toBe('A');
});

test('searchContacts matches name and phone', async () => {
  await createContact({ name: 'Ana Torres', phone: '987654321' });
  await createContact({ name: 'Beto Ruiz', phone: '912345678' });
  expect((await searchContacts('torres'))).toHaveLength(1);
  expect((await searchContacts('91234'))).toHaveLength(1);
});

test('listWithReminders returns only future-or-past reminders, sorted', async () => {
  await createContact({ name: 'Sin reminder' });
  await createContact({ name: 'Con reminder', reminder_at: Date.now() + 86400000 });
  const r = await listWithReminders();
  expect(r).toHaveLength(1);
  expect(r[0].name).toBe('Con reminder');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && bun jest lib/offline-queue/__tests__/contacts.test.ts`
Expected: FAIL — cannot find module `../contacts`.

- [ ] **Step 3: Implement `contacts.ts`**

```ts
// apps/mobile/lib/offline-queue/contacts.ts
import { randomUUID } from 'expo-crypto';
import { getDatabase } from './db';

export type ContactEstado = 'apoya' | 'duda' | 'no' | 'no_esta';

export type Contact = {
  id: string;
  name: string;
  phone: string | null;
  ubigeo: string | null;
  distrito_nombre: string | null;
  lat: number | null;
  lng: number | null;
  estado: ContactEstado;
  note: string | null;
  photo_uri: string | null;
  reminder_at: number | null;
  reminder_notif_id: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  campaign_id: string | null;
  agent_id: string | null;
  sync_status: 'local' | 'pending' | 'syncing' | 'synced' | 'failed';
  server_id: string | null;
};

export type NewContactInput = {
  name: string;
  phone?: string | null;
  ubigeo?: string | null;
  distrito_nombre?: string | null;
  lat?: number | null;
  lng?: number | null;
  estado?: ContactEstado;
  note?: string | null;
  photo_uri?: string | null;
  reminder_at?: number | null;
  agent_id?: string | null;
};

export type ContactPatch = Partial<Omit<Contact, 'id' | 'created_at'>>;

const COLS =
  'id, name, phone, ubigeo, distrito_nombre, lat, lng, estado, note, ' +
  'photo_uri, reminder_at, reminder_notif_id, created_at, updated_at, ' +
  'deleted_at, campaign_id, agent_id, sync_status, server_id';

export async function createContact(input: NewContactInput): Promise<Contact> {
  const db = await getDatabase();
  const now = Date.now();
  const c: Contact = {
    id: randomUUID(),
    name: input.name,
    phone: input.phone ?? null,
    ubigeo: input.ubigeo ?? null,
    distrito_nombre: input.distrito_nombre ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    estado: input.estado ?? 'duda',
    note: input.note ?? null,
    photo_uri: input.photo_uri ?? null,
    reminder_at: input.reminder_at ?? null,
    reminder_notif_id: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    campaign_id: null,
    agent_id: input.agent_id ?? null,
    sync_status: 'local',
    server_id: null,
  };
  await db.runAsync(
    `INSERT INTO contacts (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [c.id, c.name, c.phone, c.ubigeo, c.distrito_nombre, c.lat, c.lng, c.estado,
     c.note, c.photo_uri, c.reminder_at, c.reminder_notif_id, c.created_at,
     c.updated_at, c.deleted_at, c.campaign_id, c.agent_id, c.sync_status, c.server_id],
  );
  return c;
}

export async function getContact(id: string): Promise<Contact | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Contact>(
    `SELECT ${COLS} FROM contacts WHERE id = ?`, [id],
  );
  return row ?? null;
}

export async function updateContact(id: string, patch: ContactPatch): Promise<Contact> {
  const db = await getDatabase();
  const keys = Object.keys(patch).filter((k) => k !== 'updated_at');
  const sets = [...keys.map((k) => `${k} = ?`), 'updated_at = ?'].join(', ');
  const values = [...keys.map((k) => (patch as Record<string, unknown>)[k]), Date.now()];
  await db.runAsync(`UPDATE contacts SET ${sets} WHERE id = ?`, [...values, id]);
  const updated = await getContact(id);
  if (!updated) throw new Error(`contact ${id} not found after update`);
  return updated;
}

export async function softDeleteContact(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE contacts SET deleted_at = ?, updated_at = ? WHERE id = ?`,
    [Date.now(), Date.now(), id],
  );
}

export async function listContacts(
  filter?: { estado?: ContactEstado },
): Promise<Contact[]> {
  const db = await getDatabase();
  const where = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (filter?.estado) { where.push('estado = ?'); params.push(filter.estado); }
  return db.getAllAsync<Contact>(
    `SELECT ${COLS} FROM contacts WHERE ${where.join(' AND ')} ORDER BY updated_at DESC`,
    params,
  );
}

export async function searchContacts(query: string): Promise<Contact[]> {
  const db = await getDatabase();
  const q = `%${query.trim()}%`;
  return db.getAllAsync<Contact>(
    `SELECT ${COLS} FROM contacts
     WHERE deleted_at IS NULL AND (name LIKE ? OR phone LIKE ?)
     ORDER BY updated_at DESC`,
    [q, q],
  );
}

export async function listWithReminders(): Promise<Contact[]> {
  const db = await getDatabase();
  return db.getAllAsync<Contact>(
    `SELECT ${COLS} FROM contacts
     WHERE deleted_at IS NULL AND reminder_at IS NOT NULL
     ORDER BY reminder_at ASC`,
  );
}

export async function wipeAllContacts(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync('DELETE FROM contacts;');
}
```

> `expo-crypto` ya está disponible vía Expo SDK 54. Si `randomUUID` no se exporta, usar `Crypto.randomUUID()` de `expo-crypto`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && bun jest lib/offline-queue/__tests__/contacts.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/offline-queue/contacts.ts apps/mobile/lib/offline-queue/__tests__/contacts.test.ts
git commit -m "feat(mobile): CRUD module para contacts (create/update/softDelete/list/search)"
```

---

### Task 3: Eliminar el gate de campaña en auth

**Files:**
- Modify: `apps/mobile/lib/app-context.tsx` (estado `needs_campaign`)
- Modify: `apps/mobile/app/_layout.tsx` (RouterGuard)
- Modify: `apps/mobile/app/(main)/_layout.tsx` (línea 21 `if (auth.status !== 'active') return null`)
- Test: `apps/mobile/lib/__tests__/auth-no-campaign.test.tsx`

**Cambio de diseño:** `needs_campaign` deja de ser un estado de la unión. Un user autenticado sin campañas queda en `active` con `campaigns: []` y `config` con valores default. `buildAppConfig` debe retornar un config válido aunque `campaigns.length === 0` (usar defaults `DEFAULT_PRIMARY`/`DEFAULT_SECONDARY`, candidate vacío).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/lib/__tests__/auth-no-campaign.test.tsx
import { buildAppConfigForTest } from '../app-context';

test('buildAppConfig returns a valid config when user has zero campaigns', async () => {
  const user = { id: 'u1', full_name: '', email: 'x@goberna.pe', role: 'agente_campo', status: 'active' } as const;
  const config = await buildAppConfigForTest(user, []);
  expect(config).not.toBeNull();
  expect(config!.campaign).toBeNull();
  expect(config!.candidate.color_primario).toBe('#163960');
  expect(config!.agent.id).toBe('u1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && bun jest lib/__tests__/auth-no-campaign.test.tsx`
Expected: FAIL — `buildAppConfigForTest` not exported / returns null for empty campaigns.

- [ ] **Step 3: Refactor `app-context.tsx`**

En `app-context.tsx`:

1. Cambiar el tipo `AuthState` — eliminar el miembro `needs_campaign`:

```ts
type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'suspended'; user: AuthUser }
  | { status: 'active'; user: AuthUser; campaigns: CampaignMembership[]; config: AppConfig };
```

2. Cambiar `AppConfig.campaign` a `CampaignMembership | null` en `lib/types.ts`.

3. Modificar `buildAppConfig` — quitar el `if (campaigns.length === 0) return null;`. Cuando no hay campaña:

```ts
async function buildAppConfig(
  user: AuthUser,
  campaigns: CampaignMembership[],
): Promise<AppConfig> {
  const activeCampaign = campaigns.length > 0
    ? (campaigns.find((c) => c.id === (await authStore.getActiveCampaignId())) ?? campaigns[0])
    : null;

  if (!activeCampaign) {
    return {
      candidate: {
        id: '', name: '', slug: '', cargo: '', numero: 0, partido: '',
        foto_url: null, color_primario: DEFAULT_PRIMARY,
        color_secundario: DEFAULT_SECONDARY, logo_url: null, whatsapp_number: null,
      },
      form: null,
      agent: { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
      campaign: null,
    };
  }
  // ... resto del flujo actual con activeCampaign (sin cambios)
}

// Export para tests:
export const buildAppConfigForTest = buildAppConfig;
```

4. En `completeAuth`, boot effect, `joinCampaign`, `refreshConfig` — reemplazar toda transición a `{ status: 'needs_campaign' }` por `{ status: 'active', user, campaigns, config }` usando el nuevo `buildAppConfig` (que ya nunca retorna null). Eliminar las ramas `needs_campaign`.

- [ ] **Step 4: Update RouterGuard en `app/_layout.tsx`**

Eliminar la rama `needs_campaign`. Queda:

```tsx
if (auth.status === 'unauthenticated' || auth.status === 'suspended') {
  if (inInviteScreen) return;
  if (!inAuthGroup || segments[1] !== 'login') router.replace('/(auth)/login');
  return;
}
if (auth.status === 'active') {
  if (!inMainGroup) router.replace('/(main)/contacts');
  return;
}
```

- [ ] **Step 5: Update `app/(main)/_layout.tsx`**

La línea 21 `if (auth.status !== 'active') return null;` se mantiene (correcta — durante logout). Pero `auth.config.candidate` ahora siempre existe (defaults). Sin cambios extra salvo verificar que no rompa con `campaign: null`.

- [ ] **Step 6: Run test + typecheck**

Run: `cd apps/mobile && bun jest lib/__tests__/auth-no-campaign.test.tsx && bunx tsc --noEmit`
Expected: PASS + 0 errores TS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/lib/app-context.tsx apps/mobile/app/_layout.tsx apps/mobile/app/\(main\)/_layout.tsx apps/mobile/lib/types.ts apps/mobile/lib/__tests__/auth-no-campaign.test.tsx
git commit -m "feat(mobile): eliminar gate de campaña — user sin campaña entra a active"
```

---

### Task 4: Refresh token resiliente (5xx no expulsa al user)

**Files:**
- Modify: `apps/mobile/lib/auth-store.ts` (`refreshTokens`, líneas 192-229)
- Modify: `apps/mobile/lib/api.ts` (manejo de 401, líneas 115-129)
- Test: `apps/mobile/lib/__tests__/refresh-resilience.test.ts`

**Cambio:** `refreshTokens` retorna `'ok' | 'expired' | 'transient'`. Solo `'expired'` (401 explícito del endpoint refresh) limpia la sesión. `'transient'` (5xx, timeout, red) deja la sesión intacta.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/__tests__/refresh-resilience.test.ts
import { refreshTokens } from '../auth-store';

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

test('5xx from refresh endpoint returns transient (does not clear)', async () => {
  global.fetch = (async () => new Response('', { status: 503 })) as typeof fetch;
  // requires a refresh token present — stub getRefreshToken via SecureStore mock in jest setup
  const result = await refreshTokens('https://api.test/api');
  expect(result).toBe('transient');
});

test('401 from refresh endpoint returns expired', async () => {
  global.fetch = (async () => new Response('', { status: 401 })) as typeof fetch;
  const result = await refreshTokens('https://api.test/api');
  expect(result).toBe('expired');
});
```

> El jest setup debe mockear `expo-secure-store` para que `getRefreshToken` retorne un token no-vacío. Si no existe `jest.setup.ts` con ese mock, agregarlo: `jest.mock('expo-secure-store', () => ({ getItemAsync: async () => 'fake-refresh', setItemAsync: async () => {}, deleteItemAsync: async () => {} }))`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && bun jest lib/__tests__/refresh-resilience.test.ts`
Expected: FAIL — `refreshTokens` retorna `boolean`, no el string union.

- [ ] **Step 3: Cambiar `refreshTokens` en `auth-store.ts`**

```ts
export type RefreshResult = 'ok' | 'expired' | 'transient';

let _refreshPromise: Promise<RefreshResult> | null = null;

export async function refreshTokens(apiBase: string): Promise<RefreshResult> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async (): Promise<RefreshResult> => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return 'expired';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(`${apiBase}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) return 'expired';
        if (!response.ok) return 'transient';
        const data = await response.json() as RefreshResponse;
        await setAccessToken(data.access_token);
        await setRefreshToken(data.refresh_token);
        return 'ok';
      } finally {
        clearTimeout(timeoutId);
      }
    } catch {
      return 'transient';  // red caída / abort — NO limpiar sesión
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}
```

- [ ] **Step 4: Cambiar el manejo de 401 en `api.ts`**

```ts
    if (response.status === 401 && auth) {
      const result = await tryRefresh();
      if (result === 'ok') {
        return request<T>(method, path, body, auth);
      }
      if (result === 'expired') {
        await clearAuthData();
        return { ok: false, error: 'Sesión expirada. Iniciá sesión nuevamente.',
                 code: 'AUTH_TOKEN_EXPIRED', status: 401 };
      }
      // transient — no limpiar; devolver error recuperable
      return { ok: false, error: 'No pudimos validar tu sesión. Reintentá.',
               code: 'AUTH_REFRESH_TRANSIENT', status: 503 };
    }
```

`tryRefresh()` ahora retorna `RefreshResult`. Actualizar su firma. Actualizar también cualquier caller en `sync-service.ts` que use el booleano viejo.

- [ ] **Step 5: Run test + typecheck**

Run: `cd apps/mobile && bun jest lib/__tests__/refresh-resilience.test.ts && bunx tsc --noEmit`
Expected: PASS + 0 errores TS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/auth-store.ts apps/mobile/lib/api.ts apps/mobile/lib/offline-queue/sync-service.ts apps/mobile/lib/__tests__/refresh-resilience.test.ts
git commit -m "fix(mobile): refresh token resiliente — 5xx/timeout ya no expulsa al user"
```

---

### Task 5: Backend — demo bypass para Apple Review

**Files:**
- Modify: `apps/backend/src/config/env.ts` (agregar `demoPhone`, `demoOtp`)
- Modify: `apps/backend/src/modules/auth/whatsapp-otp.ts` (`sendOtp`)
- Test: `apps/backend/src/modules/auth/__tests__/demo-bypass.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/modules/auth/__tests__/demo-bypass.test.ts
import { test, expect } from 'bun:test';
import { isDemoPhone } from '../whatsapp-otp';

test('isDemoPhone matches the configured demo phone, normalized', () => {
  expect(isDemoPhone('999000001', '999000001')).toBe(true);
  expect(isDemoPhone('+51 999 000 001', '999000001')).toBe(true);
  expect(isDemoPhone('987654321', '999000001')).toBe(false);
  expect(isDemoPhone('999000001', '')).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun test src/modules/auth/__tests__/demo-bypass.test.ts`
Expected: FAIL — `isDemoPhone` not exported.

- [ ] **Step 3: Agregar env vars en `env.ts`**

En el tipo `AppEnv` agregar: `demoPhone: string; demoOtp: string;`. En el loader:

```ts
    demoPhone: (process.env.GOBERNA_DEMO_PHONE ?? '').replace(/\D/g, ''),
    demoOtp: (process.env.GOBERNA_DEMO_OTP ?? '').trim(),
```

- [ ] **Step 4: Implementar `isDemoPhone` + bypass en `whatsapp-otp.ts`**

Agregar la función exportada:

```ts
export function isDemoPhone(input: string, demoPhone: string): boolean {
  if (!demoPhone) return false;
  return normalizePhone(input) === normalizePhone(demoPhone);
}
```

En `sendOtp`, después del check `if (!options.botUrl)` y antes del rate-limit lock, agregar un parámetro `demoPhone`/`demoOtp` a las options y:

```ts
  // Demo bypass para Apple Review — no llama al bot, guarda el OTP fijo.
  if (options.demoPhone && isDemoPhone(phone, options.demoPhone) && options.demoOtp) {
    const hash = hashCode(options.demoOtp, normalized);
    await redisClient.set(otpKey(normalized), JSON.stringify({ hash, attempts: 0 }),
      { EX: OTP_TTL_SECONDS });
    return { ok: true, expiresIn: OTP_TTL_SECONDS };
  }
```

En `routes.ts` `/whatsapp/send`, pasar `demoPhone: env.demoPhone, demoOtp: env.demoOtp` dentro del objeto options de `sendOtp`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/backend && bun test src/modules/auth/__tests__/demo-bypass.test.ts && bunx tsc --noEmit`
Expected: PASS + 0 errores TS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/config/env.ts apps/backend/src/modules/auth/whatsapp-otp.ts apps/backend/src/modules/auth/routes.ts apps/backend/src/modules/auth/__tests__/demo-bypass.test.ts
git commit -m "feat(backend): demo bypass de OTP para Apple Review (gated por env)"
```

---

### Task 6: Backend — `DELETE /api/account`

**Files:**
- Modify: `apps/backend/src/modules/auth/routes.ts` (endpoint nuevo)
- Modify: `apps/backend/src/modules/auth/repository.ts` (`deleteUserCascade`)
- Test: `apps/backend/src/modules/auth/__tests__/account-deletion.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/modules/auth/__tests__/account-deletion.test.ts
import { test, expect } from 'bun:test';
import { buildDeleteAccountSql } from '../repository';

test('buildDeleteAccountSql produces statements in FK-safe order', () => {
  const stmts = buildDeleteAccountSql();
  // user_campaigns y refresh_tokens antes que users
  const idxUsers = stmts.findIndex((s) => /DELETE FROM users\b/.test(s));
  const idxUC = stmts.findIndex((s) => /user_campaigns/.test(s));
  const idxRT = stmts.findIndex((s) => /refresh_tokens/.test(s));
  expect(idxUC).toBeLessThan(idxUsers);
  expect(idxRT).toBeLessThan(idxUsers);
  expect(idxUsers).toBe(stmts.length - 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun test src/modules/auth/__tests__/account-deletion.test.ts`
Expected: FAIL — `buildDeleteAccountSql` not exported.

- [ ] **Step 3: Implementar `deleteUserCascade` en `repository.ts`**

```ts
export function buildDeleteAccountSql(): string[] {
  return [
    'DELETE FROM user_campaigns WHERE user_id = $1',
    'DELETE FROM refresh_tokens WHERE user_id = $1',
    'DELETE FROM access_requests WHERE user_id = $1',
    'DELETE FROM users WHERE id = $1',
  ];
}

async deleteUserCascade(userId: string): Promise<void> {
  const client = await this.pool.connect();
  try {
    await client.query('BEGIN');
    for (const sql of buildDeleteAccountSql()) {
      await client.query(sql, [userId]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

> Verificar con `\d users` en `nexus_postgres` si hay otras tablas con FK a `users.id` (ej `form_submissions.agent_id`). Si las hay y no son `ON DELETE CASCADE`, agregar su DELETE antes del de `users`. Confirmar con: `ssh deploy@161.132.39.165 "docker exec nexus_postgres psql -U appuser -d appdb -c \"SELECT conrelid::regclass FROM pg_constraint WHERE confrelid='users'::regclass AND contype='f';\""`

- [ ] **Step 4: Implementar el endpoint en `routes.ts`**

```ts
app.delete('/api/account', { preHandler: [app.authenticate] }, async (request, reply) => {
  const requestId = String(request.id);
  const authed = request as AuthenticatedRequest;
  try {
    await repo.deleteUserCascade(authed.userId);
    clearAuthCookies(reply, isProd);
    app.log.info({ user_id: authed.userId, request_id: requestId }, 'account deleted');
    return reply.code(204).send();
  } catch (error) {
    app.log.error({ err: error, request_id: requestId }, 'account deletion failed');
    return reply.code(500).send(errorPayload(requestId, 'ACCOUNT_DELETE_FAILED', 'no se pudo eliminar la cuenta'));
  }
});
```

- [ ] **Step 5: Run test + typecheck**

Run: `cd apps/backend && bun test src/modules/auth/__tests__/account-deletion.test.ts && bunx tsc --noEmit`
Expected: PASS + 0 errores TS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/auth/routes.ts apps/backend/src/modules/auth/repository.ts apps/backend/src/modules/auth/__tests__/account-deletion.test.ts
git commit -m "feat(backend): DELETE /api/account — account deletion (Apple 5.1.1v)"
```

---

## Grupo B — Core screens

### Task 7: Pantalla `contacts.tsx` (lista)

**Files:**
- Create: `apps/mobile/app/(main)/contacts.tsx` (reemplaza el rol de `dashboard.tsx`)
- Delete: `apps/mobile/app/(main)/dashboard.tsx`
- Create: `apps/mobile/components/contacts/ContactRow.tsx`
- Create: `apps/mobile/components/contacts/EstadoChips.tsx`
- Test: `apps/mobile/components/contacts/__tests__/EstadoChips.test.tsx`

**Constante de estados** — crear `apps/mobile/lib/contact-estados.ts`:

```ts
import type { ContactEstado } from './offline-queue/contacts';

export const ESTADO_META: Record<ContactEstado, { label: string; color: string; emoji: string }> = {
  apoya:   { label: 'Apoya',    color: '#16a34a', emoji: '🟢' },
  duda:    { label: 'Duda',     color: '#d97706', emoji: '🟡' },
  no:      { label: 'No',       color: '#dc2626', emoji: '🔴' },
  no_esta: { label: 'No está',  color: '#2563eb', emoji: '🔵' },
};

export const ESTADO_ORDER: ContactEstado[] = ['apoya', 'duda', 'no', 'no_esta'];
```

- [ ] **Step 1: Write the failing test (EstadoChips)**

```tsx
// apps/mobile/components/contacts/__tests__/EstadoChips.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import EstadoChips from '../EstadoChips';

test('renders Todos + 4 estado chips and fires onChange', () => {
  const onChange = jest.fn();
  const { getByText } = render(<EstadoChips value={null} onChange={onChange} />);
  getByText('Todos');
  fireEvent.press(getByText('Apoya'));
  expect(onChange).toHaveBeenCalledWith('apoya');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && bun jest components/contacts/__tests__/EstadoChips.test.tsx`
Expected: FAIL — cannot find module `../EstadoChips`.

- [ ] **Step 3: Implementar `EstadoChips.tsx`**

```tsx
// apps/mobile/components/contacts/EstadoChips.tsx
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { ContactEstado } from '@/lib/offline-queue/contacts';
import { ESTADO_META, ESTADO_ORDER } from '@/lib/contact-estados';

type Props = { value: ContactEstado | null; onChange: (v: ContactEstado | null) => void };

export default function EstadoChips({ value, onChange }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Pressable onPress={() => onChange(null)}
        style={[styles.chip, value === null && styles.chipActive]}>
        <Text style={[styles.label, value === null && styles.labelActive]}>Todos</Text>
      </Pressable>
      {ESTADO_ORDER.map((e) => (
        <Pressable key={e} onPress={() => onChange(e)}
          style={[styles.chip, value === e && { backgroundColor: ESTADO_META[e].color }]}>
          <Text style={[styles.label, value === e && styles.labelActive]}>
            {ESTADO_META[e].emoji} {ESTADO_META[e].label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
          backgroundColor: '#f1f5f9' },
  chipActive: { backgroundColor: '#163960' },
  label: { fontSize: 13, color: '#475569' },
  labelActive: { color: '#fff', fontWeight: '600' },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && bun jest components/contacts/__tests__/EstadoChips.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implementar `ContactRow.tsx` y `contacts.tsx`**

`ContactRow.tsx` — fila tappable: nombre, distrito, badge de estado (color de `ESTADO_META`), ícono de campana si `reminder_at != null`. Props: `contact: Contact; onPress: () => void`.

`contacts.tsx` — screen:
- Estado local: `query: string`, `estadoFilter: ContactEstado | null`, `contacts: Contact[]`.
- `useFocusEffect` → recarga: si `query` no vacío → `searchContacts(query)`, sino `listContacts({ estado: estadoFilter ?? undefined })`.
- Header con search `TextInput` + `<EstadoChips>`.
- `FlatList` de `<ContactRow>`; `keyExtractor` por `id`; `onPress` → `router.push('/(main)/contact/' + id)`.
- Empty state: "Tocá + para registrar tu primer contacto".
- FAB `+` (bottom-right) → `router.push('/(main)/add-contact')`.

- [ ] **Step 6: Borrar `dashboard.tsx` y actualizar referencias**

```bash
git rm apps/mobile/app/\(main\)/dashboard.tsx
```
Buscar referencias: `grep -rn "dashboard" apps/mobile/app apps/mobile/lib --include=*.tsx --include=*.ts`. Reapuntar cualquier `router.replace('/(main)/dashboard')` → `/(main)/contacts`.

- [ ] **Step 7: Typecheck + commit**

Run: `cd apps/mobile && bunx tsc --noEmit`
Expected: 0 errores.

```bash
git add apps/mobile/app/\(main\)/contacts.tsx apps/mobile/components/contacts/ apps/mobile/lib/contact-estados.ts
git commit -m "feat(mobile): pantalla Contactos — lista + búsqueda + filtro por estado"
```

---

### Task 8: Pantalla `add-contact.tsx` (alta, schema fijo)

**Files:**
- Create: `apps/mobile/app/(main)/add-contact.tsx`
- Delete: `apps/mobile/app/(main)/new-form.tsx`
- Create: `apps/mobile/components/contacts/EstadoSelector.tsx`
- Test: `apps/mobile/components/contacts/__tests__/EstadoSelector.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/components/contacts/__tests__/EstadoSelector.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import EstadoSelector from '../EstadoSelector';

test('selects an estado and calls onChange', () => {
  const onChange = jest.fn();
  const { getByText } = render(<EstadoSelector value="duda" onChange={onChange} />);
  fireEvent.press(getByText('Apoya'));
  expect(onChange).toHaveBeenCalledWith('apoya');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && bun jest components/contacts/__tests__/EstadoSelector.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar `EstadoSelector.tsx`**

Grilla 2x2 de 4 botones grandes (uno por estado), el seleccionado con `backgroundColor: ESTADO_META[e].color`. Props: `value: ContactEstado; onChange: (e: ContactEstado) => void`. Usa `ESTADO_META` + `ESTADO_ORDER`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && bun jest components/contacts/__tests__/EstadoSelector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implementar `add-contact.tsx`**

Form de schema fijo. Estado local por campo. Campos:
- Nombre (`TextInput`, requerido — botón Guardar disabled si vacío).
- Teléfono (`TextInput`, opcional, `keyboardType="phone-pad"`, validación suave PE `/^9\d{8}$/` solo warning).
- Distrito — reusar `DistritoPicker` existente (`components/DistritoPicker.tsx`), guarda `ubigeo` + `distrito_nombre`.
- Estado — `<EstadoSelector>`.
- Nota (`TextInput` multiline, opcional).
- Foto — placeholder en Fase 1, se cablea en Task 13.
- Recordatorio — placeholder en Fase 1, se cablea en Task 12.
- GPS: al montar, intentar `Location.getCurrentPositionAsync` (best-effort) → setea `lat/lng`.

Guardar → `createContact({ name, phone, ubigeo, distrito_nombre, lat, lng, estado, note, agent_id })` con `agent_id` del `useApp().auth.user.id` → `router.back()`.

- [ ] **Step 6: Borrar `new-form.tsx` + referencias**

```bash
git rm apps/mobile/app/\(main\)/new-form.tsx
```
`grep -rn "new-form" apps/mobile/app apps/mobile/components` y reapuntar a `add-contact`.

- [ ] **Step 7: Typecheck + commit**

Run: `cd apps/mobile && bunx tsc --noEmit`

```bash
git add apps/mobile/app/\(main\)/add-contact.tsx apps/mobile/components/contacts/EstadoSelector.tsx apps/mobile/components/contacts/__tests__/EstadoSelector.test.tsx
git commit -m "feat(mobile): pantalla alta de contacto — schema fijo + estado + GPS"
```

---

### Task 9: Pantalla `contact/[id].tsx` (detalle / edición)

**Files:**
- Create: `apps/mobile/app/(main)/contact/[id].tsx`
- Test: `apps/mobile/app/(main)/contact/__tests__/contact-detail.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/app/(main)/contact/__tests__/contact-detail.test.tsx
import { render, waitFor } from '@testing-library/react-native';
import { createContact } from '@/lib/offline-queue/contacts';
import ContactDetail from '../[id]';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: globalThis.__testContactId }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

test('renders the contact name from SQLite', async () => {
  const c = await createContact({ name: 'Carlos Mendoza', estado: 'apoya' });
  (globalThis as any).__testContactId = c.id;
  const { getByText } = render(<ContactDetail />);
  await waitFor(() => getByText('Carlos Mendoza'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && bun jest "app/(main)/contact/__tests__/contact-detail.test.tsx"`
Expected: FAIL — module `../[id]` not found.

- [ ] **Step 3: Implementar `contact/[id].tsx`**

- `useLocalSearchParams<{ id: string }>()` → carga con `getContact(id)`.
- Modo lectura: muestra nombre, teléfono, distrito, badge estado, nota, foto (si hay), recordatorio (si hay).
- Toggle a modo edición: mismos campos que `add-contact` precargados → `updateContact(id, patch)`.
- Botón "WhatsApp" si hay `phone` → `Linking.openURL('https://wa.me/51' + phone)`.
- Botón borrar → `Alert.alert` confirmación → `softDeleteContact(id)` → `router.back()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && bun jest "app/(main)/contact/__tests__/contact-detail.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(main\)/contact/
git commit -m "feat(mobile): pantalla detalle/edición de contacto"
```

---

### Task 10: Tab bar `(main)/_layout.tsx`

**Files:**
- Modify: `apps/mobile/app/(main)/_layout.tsx`

- [ ] **Step 1: Reescribir el tab layout**

4 tabs: `contacts` (ícono `people`), `map` (`map`), `reminders` (`notifications`), `profile` (`person`). Quitar `Tabs.Screen` de `dashboard`, `ranking`, `solicitudes`, `qr-code`, `new-form`. `add-contact` y `contact/[id]` se declaran con `href: null` (fuera del tab bar). Mantener `if (auth.status !== 'active') return null`. Los colores: usar `auth.config.candidate.color_primario` (siempre definido por defaults de Task 3).

- [ ] **Step 2: Borrar screens no usadas**

```bash
git rm apps/mobile/app/\(main\)/ranking.tsx apps/mobile/app/\(main\)/solicitudes.tsx apps/mobile/app/\(main\)/qr-code.tsx
```
`grep -rn "ranking\|solicitudes\|qr-code" apps/mobile/app apps/mobile/components --include=*.tsx` y limpiar referencias / imports muertos.

- [ ] **Step 3: Typecheck + commit**

Run: `cd apps/mobile && bunx tsc --noEmit`
Expected: 0 errores.

```bash
git add apps/mobile/app/\(main\)/_layout.tsx
git commit -m "feat(mobile): tab bar Contactos/Mapa/Follow-ups/Perfil"
```

---

## Grupo C — Map + Reminders + Photo + Profile

### Task 11: MapLibre + pantalla `map.tsx`

**Files:**
- Modify: `apps/mobile/package.json` (dep `@maplibre/maplibre-react-native`)
- Modify: `apps/mobile/app.json` (plugin si lo requiere)
- Create: `apps/mobile/lib/map-config.ts`
- Create: `apps/mobile/app/(main)/map.tsx`
- Test: `apps/mobile/lib/__tests__/map-config.test.ts`

- [ ] **Step 1: Instalar dependencia**

```bash
cd apps/mobile && bunx expo install @maplibre/maplibre-react-native
```

- [ ] **Step 2: Write the failing test (map-config)**

```ts
// apps/mobile/lib/__tests__/map-config.test.ts
import { contactsToGeoJSON, PERU_BBOX } from '../map-config';

test('contactsToGeoJSON builds a FeatureCollection with estado property', () => {
  const fc = contactsToGeoJSON([
    { id: 'a', name: 'X', lat: -12.04, lng: -77.04, estado: 'apoya' } as any,
    { id: 'b', name: 'Y', lat: null, lng: null, estado: 'no' } as any,
  ]);
  expect(fc.type).toBe('FeatureCollection');
  expect(fc.features).toHaveLength(1); // el sin coords se descarta
  expect(fc.features[0].properties.estado).toBe('apoya');
  expect(fc.features[0].geometry.coordinates).toEqual([-77.04, -12.04]);
});

test('PERU_BBOX covers the mainland', () => {
  expect(PERU_BBOX).toEqual([-81.4, -18.4, -68.6, 0]);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/mobile && bun jest lib/__tests__/map-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implementar `map-config.ts`**

```ts
// apps/mobile/lib/map-config.ts
import { API_BASE } from './api';
import type { Contact } from './offline-queue/contacts';

export const PERU_BBOX: [number, number, number, number] = [-81.4, -18.4, -68.6, 0];

// Tegola vector tiles servidos por el backend (ver spec §3).
export const TILE_URL = `${API_BASE}/tiles/{z}/{x}/{y}.vector.pbf`;

export type ContactFeature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { id: string; name: string; estado: string };
};

export function contactsToGeoJSON(contacts: Contact[]): {
  type: 'FeatureCollection'; features: ContactFeature[];
} {
  const features = contacts
    .filter((c) => c.lat != null && c.lng != null)
    .map((c): ContactFeature => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lng as number, c.lat as number] },
      properties: { id: c.id, name: c.name, estado: c.estado },
    }));
  return { type: 'FeatureCollection', features };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile && bun jest lib/__tests__/map-config.test.ts`
Expected: PASS.

- [ ] **Step 6: Implementar `map.tsx`**

- `MapView` de MapLibre con `styleJSON` mínimo: una `vector` source apuntando a `TILE_URL` (source-layer `distritos`/`departamentos` con line layers de borde) + raster basemap CartoDB Voyager como fallback visual.
- `ShapeSource` con `contactsToGeoJSON(contacts)` + `CircleLayer` con `circleColor` por `estado` (expression `match` sobre `ESTADO_META`).
- `useFocusEffect` recarga `listContacts()`.
- `onPress` en feature → `router.push('/(main)/contact/' + id)`.
- Cámara inicial: `fitBounds` al extent de los contactos; fallback `PERU_BBOX`.

- [ ] **Step 7: Typecheck + commit**

Run: `cd apps/mobile && bunx tsc --noEmit`

```bash
git add apps/mobile/package.json apps/mobile/bun.lock apps/mobile/app.json apps/mobile/lib/map-config.ts apps/mobile/lib/__tests__/map-config.test.ts apps/mobile/app/\(main\)/map.tsx
git commit -m "feat(mobile): pantalla Mapa — MapLibre + tiles Tegola + pins por estado"
```

---

### Task 12: Recordatorios — `expo-notifications` + `reminders.tsx`

**Files:**
- Modify: `apps/mobile/package.json` (dep `expo-notifications`)
- Create: `apps/mobile/lib/reminders.ts`
- Create: `apps/mobile/app/(main)/reminders.tsx`
- Modify: `apps/mobile/app/(main)/add-contact.tsx` + `contact/[id].tsx` (cablear el date picker)
- Test: `apps/mobile/lib/__tests__/reminders.test.ts`

- [ ] **Step 1: Instalar dependencia**

```bash
cd apps/mobile && bunx expo install expo-notifications
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/mobile/lib/__tests__/reminders.test.ts
import { reminderBuckets } from '../reminders';

test('reminderBuckets splits into vencidos and proximos', () => {
  const now = 1_000_000_000_000;
  const contacts = [
    { id: 'a', reminder_at: now - 1000 } as any,
    { id: 'b', reminder_at: now + 1000 } as any,
  ];
  const { vencidos, proximos } = reminderBuckets(contacts, now);
  expect(vencidos.map((c) => c.id)).toEqual(['a']);
  expect(proximos.map((c) => c.id)).toEqual(['b']);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/mobile && bun jest lib/__tests__/reminders.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implementar `reminders.ts`**

```ts
// apps/mobile/lib/reminders.ts
import * as Notifications from 'expo-notifications';
import type { Contact } from './offline-queue/contacts';

export function reminderBuckets(contacts: Contact[], now = Date.now()) {
  const withR = contacts.filter((c) => c.reminder_at != null);
  return {
    vencidos: withR.filter((c) => (c.reminder_at as number) <= now)
      .sort((a, b) => (a.reminder_at as number) - (b.reminder_at as number)),
    proximos: withR.filter((c) => (c.reminder_at as number) > now)
      .sort((a, b) => (a.reminder_at as number) - (b.reminder_at as number)),
  };
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleReminder(
  contactId: string, contactName: string, at: number,
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: { title: 'Seguimiento de contacto', body: `Recordá contactar a ${contactName}`,
               data: { contactId } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
  });
}

export async function cancelReminder(notifId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notifId);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile && bun jest lib/__tests__/reminders.test.ts`
Expected: PASS.

- [ ] **Step 6: Cablear el date picker en add/edit**

En `add-contact.tsx` y `contact/[id].tsx`: al setear un recordatorio → `requestNotificationPermission()` → `scheduleReminder()` → guardar `reminder_at` + `reminder_notif_id` con `updateContact`. Al quitar/cambiar: `cancelReminder(old)` primero.

- [ ] **Step 7: Implementar `reminders.tsx`**

Screen: `useFocusEffect` → `listWithReminders()` → `reminderBuckets()`. Dos secciones: "Vencidos" (rojo) y "Próximos". Cada item → `router.push('/(main)/contact/' + id)`.

- [ ] **Step 8: Typecheck + commit**

Run: `cd apps/mobile && bunx tsc --noEmit`

```bash
git add apps/mobile/package.json apps/mobile/bun.lock apps/mobile/lib/reminders.ts apps/mobile/lib/__tests__/reminders.test.ts apps/mobile/app/\(main\)/reminders.tsx apps/mobile/app/\(main\)/add-contact.tsx apps/mobile/app/\(main\)/contact/
git commit -m "feat(mobile): recordatorios — notificaciones locales + pantalla Follow-ups"
```

---

### Task 13: Foto del contacto — `expo-image-picker`

**Files:**
- Modify: `apps/mobile/package.json` (dep `expo-image-picker`)
- Create: `apps/mobile/components/contacts/PhotoField.tsx`
- Modify: `apps/mobile/app/(main)/add-contact.tsx` + `contact/[id].tsx`
- Test: `apps/mobile/components/contacts/__tests__/PhotoField.test.tsx`

- [ ] **Step 1: Instalar dependencia**

```bash
cd apps/mobile && bunx expo install expo-image-picker
```

- [ ] **Step 2: Write the failing test**

```tsx
// apps/mobile/components/contacts/__tests__/PhotoField.test.tsx
import { render } from '@testing-library/react-native';
import PhotoField from '../PhotoField';

test('shows placeholder when no photo', () => {
  const { getByText } = render(<PhotoField value={null} onChange={() => {}} />);
  getByText('Agregar foto');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/mobile && bun jest components/contacts/__tests__/PhotoField.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implementar `PhotoField.tsx`**

Componente: si `value` (uri) → muestra `<Image>` + botón cambiar/quitar. Si no → botón "Agregar foto" que abre `ImagePicker.launchCameraAsync({ quality: 0.5 })` (con fallback a `launchImageLibraryAsync`). `onChange(uri)` con el resultado. Comprimir con `quality: 0.5`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile && bun jest components/contacts/__tests__/PhotoField.test.tsx`
Expected: PASS.

- [ ] **Step 6: Integrar `<PhotoField>` en add/edit**

En `add-contact.tsx` y `contact/[id].tsx`: reemplazar el placeholder de foto por `<PhotoField value={photoUri} onChange={setPhotoUri} />`. Guardar `photo_uri` en el contacto.

- [ ] **Step 7: Typecheck + commit**

Run: `cd apps/mobile && bunx tsc --noEmit`

```bash
git add apps/mobile/package.json apps/mobile/bun.lock apps/mobile/components/contacts/PhotoField.tsx apps/mobile/components/contacts/__tests__/PhotoField.test.tsx apps/mobile/app/\(main\)/add-contact.tsx apps/mobile/app/\(main\)/contact/
git commit -m "feat(mobile): foto opcional del contacto (cámara/galería, comprimida)"
```

---

### Task 14: Pantalla `profile.tsx` + account deletion

**Files:**
- Create: `apps/mobile/app/(main)/profile.tsx`
- Modify: `apps/mobile/lib/api.ts` (función `deleteAccount`)
- Modify: `apps/mobile/lib/app-context.tsx` (función `deleteAccount` que limpia todo)
- Test: `apps/mobile/lib/__tests__/delete-account.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/__tests__/delete-account.test.ts
import { deleteAccount } from '../api';

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

test('deleteAccount calls DELETE /account and returns ok on 204', async () => {
  let captured = '';
  global.fetch = (async (url: string, init: RequestInit) => {
    captured = `${init.method} ${url}`;
    return new Response('', { status: 204 });
  }) as typeof fetch;
  const result = await deleteAccount();
  expect(result.ok).toBe(true);
  expect(captured).toContain('DELETE');
  expect(captured).toContain('/account');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && bun jest lib/__tests__/delete-account.test.ts`
Expected: FAIL — `deleteAccount` not exported.

- [ ] **Step 3: Implementar `deleteAccount` en `api.ts`**

```ts
/** DELETE /api/account — borra la cuenta server-side. 204 = éxito. */
export async function deleteAccount(): Promise<ApiResult<void>> {
  return request<void>('DELETE', '/account', undefined, true);
}
```

- [ ] **Step 4: Implementar `deleteAccount` en `app-context.tsx`**

```ts
const deleteAccount = useCallback(async (): Promise<ApiResult<void>> => {
  const result = await api.deleteAccount();
  if (!result.ok) return result;
  await authStore.clearAuthData();
  await wipeAllContacts();          // import desde offline-queue/contacts
  setAuth({ status: 'unauthenticated' });
  return { ok: true, data: undefined };
}, []);
```
Agregar `deleteAccount` al `AppContextValue` y al `value` memoizado.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile && bun jest lib/__tests__/delete-account.test.ts`
Expected: PASS.

- [ ] **Step 6: Implementar `profile.tsx`**

- Muestra nombre + teléfono del user (`useApp().auth.user`).
- Sección "Enlazate a una campaña": input access_code de 4 chars → `joinCampaign(code)` (ya existe en context).
- Link "Política de privacidad" → `Linking.openURL('https://goberna.club/privacy')`.
- Botón "Cerrar sesión" → `logout()`.
- Botón destructivo "Eliminar mi cuenta" → `Alert.alert` doble confirmación → `deleteAccount()`.

- [ ] **Step 7: Typecheck + commit**

Run: `cd apps/mobile && bunx tsc --noEmit`

```bash
git add apps/mobile/app/\(main\)/profile.tsx apps/mobile/lib/api.ts apps/mobile/lib/app-context.tsx apps/mobile/lib/__tests__/delete-account.test.ts
git commit -m "feat(mobile): pantalla Perfil — join campaña, privacy, eliminar cuenta"
```

---

## Grupo D — App Store + EAS Update

### Task 15: `app.json` — rename, versión, permisos

**Files:**
- Modify: `apps/mobile/app.json`

- [ ] **Step 1: Editar `app.json`**

- `name`: `"Goberna Territorio"` (era `"goberna-territory0.2"`).
- `version`: `"1.3.0"`.
- iOS `buildNumber`: `"1"`. Android `versionCode`: bump al siguiente entero.
- `ios.infoPlist`: agregar
  `"NSCameraUsageDescription": "Goberna usa la cámara para tomarle una foto opcional a tus contactos de campo."`
  `"NSPhotoLibraryUsageDescription": "Goberna accede a tu galería para adjuntar una foto a un contacto."`
- Verificar que `NSLocationWhenInUseUsageDescription` siga presente.
- Confirmar `ios.bundleIdentifier` sin cambios (no es bloqueante).

- [ ] **Step 2: Verificar el build prebuild**

Run: `cd apps/mobile && bunx expo prebuild --no-install --platform ios` (dry-run de config) o `bunx expo-doctor`.
Expected: sin errores de config.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app.json
git commit -m "chore(mobile): rename a Goberna Territorio + permisos cámara + v1.3.0"
```

---

### Task 16: EAS Update (OTA)

**Files:**
- Modify: `apps/mobile/app.json` (bloque `updates` + `runtimeVersion`)
- Modify: `apps/mobile/eas.json` (canales)

- [ ] **Step 1: Configurar `updates` + `runtimeVersion` en `app.json`**

```json
"updates": {
  "url": "https://u.expo.dev/<EAS_PROJECT_ID>",
  "enabled": true,
  "checkAutomatically": "ON_LOAD",
  "fallbackToCacheTimeout": 0
},
"runtimeVersion": { "policy": "appVersion" }
```
`<EAS_PROJECT_ID>` = el `extra.eas.projectId` ya presente en `app.json`. Si no existe, correr `bunx eas init` primero.

- [ ] **Step 2: Configurar canales en `eas.json`**

En cada perfil de build agregar `"channel"`:
```json
"build": {
  "preview":    { "channel": "preview", "distribution": "internal" },
  "production": { "channel": "production" }
}
```

- [ ] **Step 3: Verificar**

Run: `cd apps/mobile && bunx eas update:configure --non-interactive` (o `bunx expo-doctor`).
Expected: config válida; `expo-updates` reconoce el canal.

- [ ] **Step 4: Documentar el flujo de release**

Crear `apps/mobile/docs/RELEASE.md`: cambios JS-only → `eas update --branch production --message "..."`; cambios nativos (nueva dep con código nativo) → `eas build -p ios --profile production` + `eas submit`. El `runtimeVersion appVersion` garantiza que un bundle OTA solo cae en binarios con el mismo `version`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app.json apps/mobile/eas.json apps/mobile/docs/RELEASE.md
git commit -m "feat(mobile): EAS Update OTA — canales production/preview + runtimeVersion"
```

---

### Task 17: Privacy policy + Review Notes + decommission DB vacía

**Files:**
- Create: `apps/mobile/docs/APP_STORE_REVIEW_NOTES.md`
- Create: `docs/PRIVACY.md` (fuente del contenido a publicar en goberna.club/privacy)

- [ ] **Step 1: Redactar `docs/PRIVACY.md`**

Política de privacidad cubriendo: datos recogidos (teléfono del user para auth; nombre/teléfono/distrito/nota/foto/ubicación de contactos de campo = datos de terceros); almacenamiento local SQLite; sync opcional a la nube solo si el user se enlaza a campaña; sin tracking publicitario; cómo eliminar la cuenta (in-app); contacto. El dueño publica este contenido en `https://goberna.club/privacy`.

- [ ] **Step 2: Redactar `APP_STORE_REVIEW_NOTES.md`**

Notas para ASC: el app es una herramienta pública de canvassing/registro de contactos de campo, no internal-only. Credenciales demo: phone `999000001`, OTP `123456` (vía `GOBERNA_DEMO_PHONE`/`GOBERNA_DEMO_OTP` en el backend). Aclarar que el reviewer entra directo al cuaderno sin necesitar código de campaña. Mencionar account deletion in-app (Perfil → Eliminar mi cuenta).

- [ ] **Step 3: Decomisionar `maquina_electoral_postgres`**

Verificar que ningún contenedor lo use:
```bash
ssh deploy@161.132.39.165 "for c in \$(docker ps -q); do docker inspect \$c --format '{{.Name}} {{range .Config.Env}}{{.}} {{end}}' | grep -q maquina_electoral_postgres && echo \$c; done"
```
Si el resultado es vacío → coordinar con el dueño detener y remover el contenedor + su volumen. **No borrar sin confirmación explícita del dueño.**

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/docs/APP_STORE_REVIEW_NOTES.md docs/PRIVACY.md
git commit -m "docs: privacy policy + App Store review notes (Fase 1)"
```

---

### Task 18: E2E con Maestro

**Files:**
- Create: `apps/mobile/.maestro/add-contact.yaml`
- Create: `apps/mobile/.maestro/delete-account.yaml`

- [ ] **Step 1: Flow `add-contact.yaml`**

```yaml
appId: com.estephano.gobernaterritory02
---
- launchApp
- tapOn: "Recibir código"      # asume sesión demo ya iniciada o stub
- assertVisible: "Contactos"
- tapOn:
    id: "fab-add-contact"
- inputText: "Maria E2E"
- tapOn: "Apoya"
- tapOn: "Guardar"
- assertVisible: "Maria E2E"
```

- [ ] **Step 2: Flow `delete-account.yaml`**

```yaml
appId: com.estephano.gobernaterritory02
---
- launchApp
- tapOn: "Perfil"
- tapOn: "Eliminar mi cuenta"
- tapOn: "Eliminar"            # confirmación
- tapOn: "Eliminar"            # doble confirmación
- assertVisible: "Ingresá tu número"   # volvió al login
```

- [ ] **Step 3: Correr Maestro**

Run: `cd apps/mobile && maestro test .maestro/`
Expected: ambos flows PASS (requiere simulador iOS corriendo + app instalada con build de dev).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/.maestro/
git commit -m "test(mobile): E2E Maestro — alta de contacto + eliminar cuenta"
```

---

## Cierre de Fase 1

- [ ] **Verificación final**

Run: `cd apps/mobile && bunx tsc --noEmit && bun jest && bunx expo-doctor`
Run: `cd apps/backend && bunx tsc --noEmit && bun test`
Expected: 0 errores TS, todos los tests PASS, expo-doctor limpio.

- [ ] **Build + submit**

`eas build -p ios --profile production` → `eas submit -p ios`. Adjuntar `APP_STORE_REVIEW_NOTES.md` en ASC. Cambiar el estado a **listed** tras aprobación.

---

## Self-Review (cobertura de spec)

- §3.1 estado auth sin `needs_campaign` → Task 3 ✓
- §3.2 screens → Tasks 7-14 ✓ · §3.3 deps → Tasks 11/12/13 ✓
- §4 tabla `contacts` canónica → Tasks 1-2 ✓
- §5 pantallas (detalle funcional) → Tasks 7-14 ✓
- §6 demo bypass → Task 5 ✓
- §7 App Store deliverables → Tasks 15/17 ✓
- §8 backend (demo bypass + account deletion) → Tasks 5/6 ✓
- §9 EAS Update → Task 16 ✓
- §10 testing → tests TDD en cada task + Task 18 E2E ✓
- §12 riesgo refresh token → Task 4 ✓ · riesgo DB vacía → Task 17 step 3 ✓

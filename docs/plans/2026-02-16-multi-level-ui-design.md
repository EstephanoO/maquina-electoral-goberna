# Multi-Level UI Design — GOBERNA nexus-web

**Date:** 2026-02-16
**Status:** Approved
**Scope:** UI only (mock data, no backend integration)

---

## 1. Problem

The current nexus-web has a flat admin-only structure. We need a three-level hierarchy:

1. **Admin GOBERNA** — manages all candidates
2. **Candidato** — manages their own field agents + operators
3. **Operadora** — sees CMS with incoming form submissions

All three levels share the same app, same login, same URL. The role determines what's visible.

---

## 2. Approach

**Flat routes with role-based guards** (Approach A from brainstorming).

Keep the existing `/(dashboard)/...` route group. Extend the sidebar's `adminOnly` boolean to a `roles: string[]` array. Add new pages as siblings in the same layout.

### Why not route groups per role

- Duplicates layout code
- Admin can't easily "enter" a candidate's context
- Overkill for 2-dev team at this stage

---

## 3. Role Model

```
Role hierarchy:
  admin       → sees everything, can impersonate candidate context
  candidato   → sees own campaign scope
  operadora   → sees CMS for assigned campaign
  agente      → Expo only, never enters web
```

### Auth context changes

Current `User.role` is a single string (`admin`, `user`). For this UI-only phase we mock the role values. The `campaigns` array already supports multi-campaign; we leverage `Campaign.role` to determine the user's role within a campaign context.

---

## 4. Navigation Map

### Sidebar items with role visibility

| Item         | Route          | Roles                        | Notes                          |
|--------------|----------------|------------------------------|--------------------------------|
| Dashboard    | `/`            | admin, candidato, operadora  | Content varies by role         |
| Candidatos   | `/candidatos`  | admin                        | CRUD + "enter context" action  |
| Mapa         | `/map`         | admin, candidato             | Scoped to campaign if candidato|
| Equipo       | `/equipo`      | candidato                    | NEW: agents + operators list   |
| Formularios  | `/formularios` | admin, candidato             | Scoped to campaign             |
| CMS          | `/cms`         | candidato, operadora         | NEW: submissions table+detail  |
| Ops          | `/ops`         | admin                        | Global metrics                 |
| Settings     | `/settings`    | admin, candidato             | Campaign or global settings    |

### Removed/consolidated from current nav

- `/agents` and `/surveys` — currently empty placeholders, absorbed into Equipo and CMS

---

## 5. New Screens

### 5.1 Modal "Crear Candidato" (slide-over on `/candidatos`)

**Trigger:** "Nuevo Candidato" button on candidatos page.
**Layout:** Right slide-over panel (consistent with existing patterns).
**Fields:**
- Foto del candidato (image upload zone with preview)
- Foto/logo del partido (image upload zone with preview)
- Nombre completo
- Cargo (select: Alcalde, Regidor, Congresista, Gobernador Regional)
- Numero de candidatura (number input)
- Nombre del partido
- Color del partido (optional, color picker)

**Right side:** Live preview card showing how the candidate will appear in the Expo app and in the system.

**Actions:** Crear (mock — adds to local state), Cancelar (closes panel).

### 5.2 Dashboard Home (`/`) — role-contextual

**Admin view:**
- Welcome header with user name
- 4 KPI cards: Total candidatos, Agentes online (global), Forms recibidos hoy, Submissions pendientes CMS
- Recent activity feed (last 5 events)
- Quick actions: Crear candidato, Ver solicitudes pendientes

**Candidato view:**
- Welcome header with campaign name
- 4 KPI cards: Agentes online (mine), Forms recibidos hoy (mine), Submissions sin procesar, Cobertura territorial
- Quick actions: Ver mapa, Ir al CMS

**Operadora view:**
- Welcome header
- 2 KPI cards: Submissions pendientes, Procesados hoy
- Direct link to CMS
- Mini table of latest 5 submissions

### 5.3 Equipo page (`/equipo`) — candidato only

**Layout:** Table with tabs "Agentes" and "Operadoras".

**Agentes tab:**
- Table columns: Nombre, Estado (online/offline badge), Ultima actividad, Forms enviados, Zona asignada
- Mock data: 5-8 agents

**Operadoras tab:**
- Table columns: Nombre, Email, Estado, Submissions procesados
- Button "Invitar operadora" (mock — opens small modal)

### 5.4 CMS page (`/cms`) — candidato + operadora

**Layout:** Table + right detail panel (master-detail).

**Table columns:**
- Fecha/hora
- Agente (name)
- Formulario (name)
- Zona/ubicacion
- Estado (nuevo, revisado, procesado) — color badge

**Filters bar:**
- Date range picker
- Agent select
- Form type select
- Status filter (chips)

**Detail panel (right slide):**
- Full form submission data rendered as key-value pairs
- Agent info: name, location at time of submission, photo
- Map pin showing submission location
- Actions: Marcar como revisado, Marcar como procesado, Agregar nota

**Mock data:** 15-20 submissions across different forms, agents, statuses.

### 5.5 Candidatos page updates (`/candidatos`)

**New elements:**
- "Nuevo Candidato" button in header → opens slide-over (5.1)
- Each candidate row gets "Entrar" action → sets active campaign and redirects to `/` (simulating candidato-level view)
- Edit action → opens same slide-over pre-filled
- Better empty state with CTA

---

## 6. Sidebar Refactor

### Current NAV_ITEMS structure

```typescript
type NavItem = {
  icon: React.ReactNode;
  label: string;
  href: string;
  adminOnly?: boolean;  // ← too simple
};
```

### New structure

```typescript
type NavItem = {
  icon: React.ReactNode;
  label: string;
  href: string;
  roles: ("admin" | "candidato" | "operadora")[];
  section?: "main" | "admin";  // visual grouping with separator
};
```

### Visibility logic

```typescript
const userRole = getUserEffectiveRole(user, activeCampaign);
const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(userRole));
```

For mock phase, we add a role switcher at the bottom of the sidebar (dev-only) to toggle between admin/candidato/operadora views.

---

## 7. Design System Compliance

All new screens use:
- Existing CSS custom properties from `globals.css` (goberna-blue-*, goberna-gold-*, semantic tokens)
- Inline styles (consistent with current codebase pattern — no Tailwind classes in components)
- `var(--font-montserrat)` font stack
- `var(--radius-*)`, `var(--shadow-*)` tokens
- StatusBadge pattern from candidatos page
- Spinner pattern from candidatos page
- Animation: `goberna-fade-in` keyframes already defined

---

## 8. Mock Data Strategy

Each page defines its mock data as top-level constants. No API calls.

```typescript
// At top of file
const MOCK_ROLE: "admin" | "candidato" | "operadora" = "admin";

const MOCK_CANDIDATES = [ ... ];
const MOCK_SUBMISSIONS = [ ... ];
const MOCK_AGENTS = [ ... ];
```

A global mock context or the existing auth context will be extended with a `mockRole` state for easy switching during development.

---

## 9. File Structure (new/modified files)

```
nexus-web/app/(dashboard)/
  layout.tsx                    ← MODIFY: role-based nav, section groups, dev role switcher
  page.tsx                      ← REWRITE: role-contextual dashboard
  candidatos/page.tsx           ← MODIFY: add "Nuevo" button + slide-over
  equipo/page.tsx               ← NEW: team management
  cms/page.tsx                  ← NEW: submissions table + detail
  formularios/page.tsx          ← KEEP (already works)
  map/page.tsx                  ← KEEP (already works)
  ops/page.tsx                  ← KEEP (already works)

nexus-web/lib/
  auth-context.tsx              ← MODIFY: add mockRole for dev switching
  mock-data.ts                  ← NEW: centralized mock data constants
```

---

## 10. Out of Scope (this phase)

- Backend API endpoints for new features
- Real image upload (S3/Cloudflare R2)
- Real-time SSE integration for CMS
- Expo implementation
- Authentication flow changes
- Database schema changes

# Backend Integration Guide

> **For:** Mobile (Expo) and Web (Next.js) developers  
> **Backend:** Fastify + TypeScript + Bun  
> **Base URL (production):** `https://dashboard.grupogoberna.com/api`  
> **Last updated:** 2026-02-18

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Authentication](#2-authentication)
3. [Campaign Context](#3-campaign-context)
4. [API Conventions](#4-api-conventions)
5. [Endpoints Reference](#5-endpoints-reference)
6. [Real-Time Agent Tracking](#6-real-time-agent-tracking)
7. [Form Submissions](#7-form-submissions)
8. [Zones & Org Hierarchy](#8-zones--org-hierarchy)
9. [Invitations](#9-invitations)
10. [Offline/Sync Patterns (Mobile)](#10-offlinesync-patterns-mobile)
11. [Error Handling](#11-error-handling)
12. [TypeScript Types](#12-typescript-types)

---

## 1. Quick Start

### Base URLs

| Environment | URL |
|---|---|
| Production | `https://dashboard.grupogoberna.com/api` |
| Local dev | `http://localhost:3001/api` |
| VPS direct | `http://161.132.39.165/api` |

### Verify connectivity

```bash
# Health (no auth)
curl https://dashboard.grupogoberna.com/api/health

# Readiness (checks DB + Redis + Tegola)
curl https://dashboard.grupogoberna.com/api/ready
```

### Web (Next.js)

The web app uses a Vercel rewrite — all `/api/*` calls go to the backend transparently. No need to configure a separate API URL:

```typescript
// Just fetch from /api/* — Vercel rewrites to the backend
const res = await fetch("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
```

### Mobile (Expo)

```typescript
import Constants from "expo-constants";

const API_BASE = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_API_URL
  ?? "https://dashboard.grupogoberna.com/api";
```

---

## 2. Authentication

### 2.1 Login

```
POST /api/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "secret123" }
```

**Response 200:**

```json
{
  "ok": true,
  "request_id": "req-1",
  "access_token": "eyJhbG...",
  "refresh_token": "a1b2c3d4...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "Juan Perez",
    "role": "jefe_campana",
    "status": "active"
  },
  "campaigns": [
    { "id": "uuid", "name": "Cesar Vasquez", "slug": "cesar-vasquez", "role": "jefe_campana" }
  ]
}
```

### 2.2 Registration

Two modes:

| Mode | Behavior |
|---|---|
| **With `invitation_code`** | User is `active` immediately, assigned to campaign + org hierarchy |
| **Without invitation** | User is `pending`, needs admin approval |

```
POST /api/auth/register
Content-Type: application/json

{
  "email": "nuevo@example.com",
  "password": "MinLength8!",
  "full_name": "Maria Garcia",
  "invitation_code": "ABC123"       // optional
}
```

### 2.3 Token Storage

| Platform | Storage | Keys |
|---|---|---|
| Web | `localStorage` | `goberna_access_token`, `goberna_refresh_token`, `goberna_active_campaign` |
| Mobile | `expo-secure-store` | `goberna_access_token`, `goberna_refresh_token`, `goberna_user`, `goberna_campaigns`, `goberna_active_campaign_id` |

### 2.4 Using the Access Token

All authenticated requests use the `Authorization` header:

```
Authorization: Bearer <access_token>
```

### 2.5 Auto-Refresh Flow

Access tokens expire in **15 minutes**. Refresh tokens last **7 days** with rotation.

```
1. Any request returns 401 (expired JWT)
2. POST /api/auth/refresh  { "refresh_token": "<saved_refresh_token>" }
3. Receive new access_token + new refresh_token (rotation!)
4. Save both new tokens
5. Retry the original request with the new access_token
```

**Important:** The refresh token is rotated on each use. Always save the **new** refresh token from the response.

```typescript
// Pseudo-code for an API client with auto-refresh
async function apiCall(url: string, options: RequestInit): Promise<Response> {
  let res = await fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${getAccessToken()}` },
  });

  if (res.status === 401) {
    const refreshRes = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: getRefreshToken() }),
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();
      saveTokens(data.access_token, data.refresh_token);
      // Retry original request
      res = await fetch(url, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${data.access_token}` },
      });
    } else {
      // Refresh failed — force logout
      clearTokens();
      redirectToLogin();
    }
  }

  return res;
}
```

### 2.6 Get Current User

```
GET /api/auth/me
Authorization: Bearer <token>
```

Returns the user profile and their campaign memberships. Admin users see all active campaigns.

### 2.7 Rate Limiting

Login and register are rate-limited to **10 requests/minute per IP** (configurable via `RATE_LIMIT_AUTH_PER_MINUTE`). Exceeding the limit returns `429` with code `RATE_LIMITED`.

---

## 3. Campaign Context

Goberna is **multi-tenant by campaign**. Most endpoints require a campaign context.

### How to pass campaign context

Use the `x-campaign-id` header:

```
GET /api/meets
Authorization: Bearer <token>
x-campaign-id: <campaign-uuid>
```

The backend reads campaign context from:
1. `x-campaign-id` header (preferred)
2. The user's first campaign if they only belong to one

Some endpoints embed the campaign ID in the URL path instead:

```
GET /api/zones/campaign/:campaignId
GET /api/org-hierarchy/campaign/:campaignId
GET /api/invitations/campaign/:campaignId
```

### Campaign selection pattern

After login, the user picks a campaign from `campaigns[]` in the login response. Store it:

```typescript
// Web
localStorage.setItem("goberna_active_campaign", campaignId);

// Mobile
await SecureStore.setItemAsync("goberna_active_campaign_id", campaignId);
```

Then include it in every request:

```typescript
headers: {
  "Authorization": `Bearer ${token}`,
  "x-campaign-id": activeCampaignId,
}
```

---

## 4. API Conventions

### Response envelope

All responses follow this shape:

```typescript
// Success
{ "ok": true, "request_id": "req-123", ...data }

// Error
{ "ok": false, "request_id": "req-123", "code": "ERROR_CODE", "message": "human-readable" }
```

### Pagination

Paginated endpoints accept `?limit=50&offset=0` query params and return:

```json
{ "ok": true, "total": 250, "limit": 50, "offset": 0, "submissions": [...] }
```

### Role Hierarchy

Five levels, from highest to lowest:

| Role | Level | Description |
|---|---|---|
| `admin` | 50 | Full system access |
| `consultor` | 40 | External consultants |
| `jefe_campana` | 30 | Campaign managers |
| `brigadista_zonal` | 20 | Zone coordinators |
| `agente_campo` | 10 | Field agents (mobile users) |

Authorization checks: a role with `level >= required_level` passes.

---

## 5. Endpoints Reference

### Public (no auth)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Liveness |
| `GET` | `/api/ready` | Readiness (DB + Redis + Tegola) |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/register` | Register |
| `GET` | `/api/candidates` | Public candidate list |
| `GET` | `/api/invitations/validate/:code` | Validate invitation code |

### Auth

| Method | Path | Min Role | Description |
|---|---|---|---|
| `GET` | `/api/auth/me` | any | Current user + campaigns |
| `POST` | `/api/auth/refresh` | — | Renew tokens |
| `POST` | `/api/auth/logout` | any | Revoke session |
| `POST` | `/api/auth/change-password` | any | Change password |

### Campaigns

| Method | Path | Min Role | Description |
|---|---|---|---|
| `GET` | `/api/campaigns` | any | List user's campaigns |
| `GET` | `/api/campaigns/:id` | any | Campaign config |
| `POST` | `/api/campaigns` | admin | Create campaign |
| `PUT` | `/api/campaigns/:id` | jefe_campana | Update campaign |
| `GET` | `/api/campaigns/:slug/stats` | any | Dashboard stats |
| `GET` | `/api/campaigns/:id/members` | jefe_campana | List members |
| `POST` | `/api/campaigns/:id/members` | admin | Add member |
| `DELETE` | `/api/campaigns/:id/members/:userId` | admin | Remove member |
| `PUT` | `/api/campaigns/:id/members/:userId/role` | jefe_campana | Change member role |

### Form Submissions (new JSONB)

| Method | Path | Min Role | Description |
|---|---|---|---|
| `POST` | `/api/form-submissions` | any + campaign | Submit single |
| `POST` | `/api/form-submissions/batch` | any + campaign | Submit batch |
| `GET` | `/api/form-submissions` | any + campaign | List (paginated) |
| `GET` | `/api/form-submissions/recent` | any + campaign | Recent entries |
| `GET` | `/api/form-submissions/meet/:meetId` | any | By meet |
| `GET` | `/api/form-submissions/stats` | any + campaign | Count stats |

### Forms (legacy — still operational, dual-writes to form_submissions)

| Method | Path | Min Role | Description |
|---|---|---|---|
| `POST` | `/api/forms` | any + campaign | Submit single |
| `POST` | `/api/forms/batch` | any + campaign | Submit batch |

### Meets

| Method | Path | Min Role | Description |
|---|---|---|---|
| `GET` | `/api/meets` | any + campaign | List meets |
| `POST` | `/api/meets` | brigadista_zonal | Create meet |
| `PUT` | `/api/meets/:id` | brigadista_zonal | Update meet |
| `PUT` | `/api/meets/:id/status` | brigadista_zonal | Change status |

### Zones

| Method | Path | Min Role | Description |
|---|---|---|---|
| `GET` | `/api/zones/campaign/:campaignId` | any | List zones |
| `GET` | `/api/zones/campaign/:campaignId/geojson` | any | GeoJSON FeatureCollection |
| `GET` | `/api/zones/:id` | any | Zone detail |
| `POST` | `/api/zones` | jefe_campana | Create zone |
| `PUT` | `/api/zones/:id` | jefe_campana | Update zone |
| `DELETE` | `/api/zones/:id` | jefe_campana | Delete zone |

### Org Hierarchy

| Method | Path | Min Role | Description |
|---|---|---|---|
| `GET` | `/api/org-hierarchy/campaign/:campaignId` | any | Full tree |
| `GET` | `/api/org-hierarchy/campaign/:campaignId/subordinates/:userId` | any | User's subordinates |
| `POST` | `/api/org-hierarchy` | jefe_campana | Create node |
| `PUT` | `/api/org-hierarchy/:id` | jefe_campana | Update node |
| `DELETE` | `/api/org-hierarchy/:id` | jefe_campana | Delete node |

### Invitations

| Method | Path | Min Role | Description |
|---|---|---|---|
| `POST` | `/api/invitations` | jefe_campana | Create invitation |
| `GET` | `/api/invitations/campaign/:campaignId` | jefe_campana | List invitations |
| `GET` | `/api/invitations/validate/:code` | (public) | Validate code |
| `DELETE` | `/api/invitations/:id` | jefe_campana | Revoke |

### Access Requests

| Method | Path | Min Role | Description |
|---|---|---|---|
| `GET` | `/api/access-requests` | jefe_campana | List pending |
| `POST` | `/api/access-requests/:id/resolve` | jefe_campana | Approve/reject |

### Agent Tracking

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/agents/location` | `x-agent-token` | Single location |
| `POST` | `/api/agents/locations/batch` | `x-agent-token` | Batch locations |
| `GET` | `/api/agents/live` | JWT | Current positions |
| `GET` | `/api/agents/stream` | JWT | SSE stream |
| `GET` | `/api/agents/health` | (public) | Tracking health |

---

## 6. Real-Time Agent Tracking

Tracking uses a **separate auth mechanism** — the `x-agent-token` header (a shared secret), not JWT.

### 6.1 Sending Location (Mobile)

```typescript
const AGENT_TOKEN = Constants.expoConfig?.extra?.EXPO_PUBLIC_AGENT_INGEST_TOKEN;

// Single location
await fetch(`${API_BASE}/agents/location`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-agent-token": AGENT_TOKEN,
  },
  body: JSON.stringify({
    agent_id: userId,          // UUID of the logged-in user
    ts: new Date().toISOString(),
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    accuracy: location.coords.accuracy,
    speed: location.coords.speed,
    heading: location.coords.heading,
    battery: batteryLevel,     // 0-100, optional
    seq: nextSeq(),            // Monotonically increasing integer
    campaign_id: activeCampaignId,
  }),
});
```

**Response 202** (accepted):
```json
{ "ok": true, "accepted": true, "server_ts": "2026-02-18T..." }
```

**Response 200** (deduped — same or lower `seq`):
```json
{ "ok": true, "deduped": true, "accepted": false }
```

### 6.2 Batch Location (Mobile)

More efficient for syncing queued locations:

```typescript
await fetch(`${API_BASE}/agents/locations/batch`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-agent-token": AGENT_TOKEN,
  },
  body: JSON.stringify({
    locations: [
      { agent_id, ts, lat, lng, seq: 1, campaign_id, ... },
      { agent_id, ts, lat, lng, seq: 2, campaign_id, ... },
    ],
  }),
});
```

**Response 202:**
```json
{ "ok": true, "total": 50, "accepted": 45, "deduped": 5, "failed": 0, "server_ts": "..." }
```

### 6.3 Reading Live Positions (Web)

```typescript
// Polling
const res = await fetch("/api/agents/live", {
  headers: { Authorization: `Bearer ${token}` },
});
const data = await res.json();
// data.agents = [{ agent_id, lat, lng, ts, accuracy, speed, battery, campaign_id }, ...]
```

### 6.4 SSE Stream (Web)

For real-time updates without polling:

```typescript
// Note: EventSource doesn't support custom headers natively.
// Use a library like eventsource or fetch-event-source for JWT auth.
import { fetchEventSource } from "@microsoft/fetch-event-source";

fetchEventSource("/api/agents/stream", {
  headers: { Authorization: `Bearer ${token}` },
  onmessage(ev) {
    switch (ev.event) {
      case "snapshot":        // Full state on connect
      case "location.batch":  // Incremental updates
        const data = JSON.parse(ev.data);
        updateAgents(data.agents);
        break;
      case "agent.offline":
        const { agent_id } = JSON.parse(ev.data);
        removeAgent(agent_id);
        break;
      case "heartbeat":
        break; // Keep-alive
    }
  },
});
```

**SSE Events:**

| Event | Payload | When |
|---|---|---|
| `snapshot` | `{ ts, agents: [...] }` | On connect (full state) |
| `location.batch` | `{ ts, agents: [...] }` | Every ~120ms (changed agents) |
| `agent.offline` | `{ agent_id, ts }` | Agent disconnected (stale >2min) |
| `heartbeat` | `{ ts }` | Every ~25s |

### 6.5 Deduplication

The `seq` field is a monotonically increasing integer per agent. The backend rejects locations where `seq <= current_seq`. Mobile must:

1. Start `seq` at 0 (or load last saved value)
2. Increment by 1 for each GPS event
3. Persist `seq` across app restarts

---

## 7. Form Submissions

### 7.1 New System (JSONB) — Preferred

Flexible schema — the `data` field is free-form JSONB:

```
POST /api/form-submissions
Authorization: Bearer <token>
x-campaign-id: <campaign-id>
Content-Type: application/json

{
  "client_id": "local-uuid-for-dedupe",
  "data": {
    "nombre": "Pedro Lopez",
    "telefono": "999888777",
    "candidato_preferido": "Cesar Vasquez",
    "comentarios": "Votante seguro"
  },
  "form_definition_id": "optional-uuid",
  "meet_id": "optional-uuid",
  "lat": -12.0464,
  "lng": -77.0428
}
```

The `client_id` is used for deduplication. Generate a UUID on the client and persist it with the local record.

### 7.2 Batch Submission

```
POST /api/form-submissions/batch
Authorization: Bearer <token>
x-campaign-id: <campaign-id>
Content-Type: application/json

{
  "submissions": [
    { "client_id": "uuid-1", "data": {...}, "lat": -12.04, "lng": -77.04 },
    { "client_id": "uuid-2", "data": {...}, "lat": -12.05, "lng": -77.05 }
  ]
}
```

**Response 201:**
```json
{ "ok": true, "accepted": 2, "attempted": 2 }
```

### 7.3 Legacy Forms (still operational)

The old `POST /api/forms` and `POST /api/forms/batch` endpoints still work. They write to the legacy `forms` table AND best-effort dual-write to `form_submissions`. Mobile apps using the old format can continue without changes, but new development should use `/api/form-submissions`.

### 7.4 Querying Submissions

```
# Paginated list
GET /api/form-submissions?limit=50&offset=0
x-campaign-id: <campaign-id>

# Recent (last N)
GET /api/form-submissions/recent?limit=20
x-campaign-id: <campaign-id>

# By meet
GET /api/form-submissions/meet/:meetId

# Stats
GET /api/form-submissions/stats
x-campaign-id: <campaign-id>
# -> { stats: { total: 177, today: 12, week: 45 } }
```

---

## 8. Zones & Org Hierarchy

### 8.1 Zones

Zones are **center point + radius** (simplest for mobile map display):

```typescript
type Zone = {
  id: string;
  campaign_id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;    // default 1000
  color: string;            // hex, default "#3B82F6"
  assigned_to: string | null;
  metadata: Record<string, unknown>;
};
```

**List zones:**
```
GET /api/zones/campaign/:campaignId
```

**GeoJSON (for map rendering):**
```
GET /api/zones/campaign/:campaignId/geojson
```

Returns a standard GeoJSON `FeatureCollection` with `Point` geometries. Each feature's `properties` includes `radius_meters` for circle rendering:

```json
{
  "geojson": {
    "type": "FeatureCollection",
    "features": [{
      "type": "Feature",
      "properties": { "id": "...", "name": "Zona Norte", "radius_meters": 500, "color": "#3B82F6" },
      "geometry": { "type": "Point", "coordinates": [-77.04, -12.05] }
    }]
  }
}
```

### 8.2 Org Hierarchy

A tree structure linking users to their supervisors within a campaign:

```
admin
  └── consultor
        └── jefe_campana
              └── brigadista_zonal
                    └── agente_campo
```

**Get full tree:**
```
GET /api/org-hierarchy/campaign/:campaignId
```

**Get subordinates of a user:**
```
GET /api/org-hierarchy/campaign/:campaignId/subordinates/:userId
```

**Create a node (assign supervisor relationship):**
```
POST /api/org-hierarchy
{
  "campaign_id": "uuid",
  "user_id": "uuid",
  "parent_user_id": "uuid-of-supervisor",
  "role": "agente_campo",
  "zone_id": "optional-zone-uuid"
}
```

---

## 9. Invitations

Invitation codes allow pre-approved registration with automatic campaign + role assignment.

### 9.1 Create Invitation (jefe_campana+)

```
POST /api/invitations
Authorization: Bearer <token>

{
  "campaign_id": "uuid",
  "role": "agente_campo",
  "parent_user_id": "uuid-of-supervisor",    // optional
  "zone_id": "uuid-of-zone",                 // optional
  "max_uses": 10,                             // default 1
  "expires_in_hours": 72                      // default 48
}
```

**Response:**
```json
{
  "ok": true,
  "invitation": {
    "id": "uuid",
    "code": "ABC123XY",
    "campaign_id": "uuid",
    "role": "agente_campo",
    "max_uses": 10,
    "used_count": 0,
    "expires_at": "2026-02-21T..."
  }
}
```

### 9.2 Validate Code (public, no auth)

```
GET /api/invitations/validate/ABC123XY
```

```json
{
  "ok": true,
  "valid": true,
  "invitation": {
    "campaign_name": "Cesar Vasquez",
    "campaign_slug": "cesar-vasquez",
    "role": "agente_campo"
  }
}
```

### 9.3 Registration with Invitation

```
POST /api/auth/register
{
  "email": "agente@example.com",
  "password": "MinLength8!",
  "full_name": "Pedro Quispe",
  "invitation_code": "ABC123XY"
}
```

Result: user is `active`, assigned to the campaign with the invitation's role, and placed under the specified supervisor in the org hierarchy.

---

## 10. Offline/Sync Patterns (Mobile)

Peru has intermittent connectivity. The mobile app must work offline.

### 10.1 Architecture

```
┌─────────────────────────────────┐
│          MOBILE APP             │
│                                 │
│  ┌───────────┐  ┌───────────┐  │
│  │ GPS       │  │ Forms     │  │
│  │ Service   │  │ UI        │  │
│  └─────┬─────┘  └─────┬─────┘  │
│        │              │         │
│        v              v         │
│  ┌─────────────────────────┐    │
│  │    SQLite Queue         │    │
│  │  (offline-first store)  │    │
│  └──────────┬──────────────┘    │
│             │                   │
│             v                   │
│  ┌──────────────────────┐       │
│  │    Sync Service      │       │
│  │  (when online)       │       │
│  └──────────┬───────────┘       │
│             │                   │
└─────────────┼───────────────────┘
              │
              v
       Backend API
```

### 10.2 Location Queue (SQLite)

```sql
CREATE TABLE tracking_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  seq INTEGER NOT NULL,
  accuracy REAL,
  speed REAL,
  heading REAL,
  battery INTEGER,
  campaign_id TEXT,
  synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Sync strategy:**
1. GPS events are always saved to SQLite first
2. When online, batch-send unsynced records:
   ```sql
   SELECT * FROM tracking_queue WHERE synced = 0 ORDER BY seq LIMIT 100;
   ```
3. On success, mark synced:
   ```sql
   UPDATE tracking_queue SET synced = 1 WHERE id IN (...);
   ```
4. Periodically purge old synced records

### 10.3 Form Queue (SQLite)

```sql
CREATE TABLE form_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL UNIQUE,
  campaign_id TEXT NOT NULL,
  form_definition_id TEXT,
  meet_id TEXT,
  data TEXT NOT NULL,           -- JSON string
  lat REAL,
  lng REAL,
  synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Sync strategy:**
1. Forms are saved to SQLite with a `client_id` (UUID generated on device)
2. When online, batch-send via `POST /api/form-submissions/batch`
3. The `client_id` field prevents duplicates if the request is retried
4. Mark synced on 201 response

### 10.4 Network Detection

```typescript
import NetInfo from "@react-native-community/netinfo";

NetInfo.addEventListener((state) => {
  if (state.isConnected) {
    syncLocationQueue();
    syncFormQueue();
  }
});
```

### 10.5 Retry & Backoff

- On network error: retry with exponential backoff (1s, 2s, 4s, 8s, max 60s)
- On `429` (rate limited): back off for the `Retry-After` header value
- On `503` (backpressure): wait 5s and retry
- On `401` (invalid token): stop retrying, check token configuration
- On `4xx` (other): don't retry (client error)

---

## 11. Error Handling

### Error Response Shape

```json
{
  "ok": false,
  "request_id": "req-abc",
  "code": "AUTH_TOKEN_EXPIRED",
  "message": "token expirado"
}
```

### Common Error Codes

| Code | HTTP | Meaning | Action |
|---|---|---|---|
| `AUTH_TOKEN_MISSING` | 401 | No Authorization header | Add token |
| `AUTH_TOKEN_EXPIRED` | 401 | JWT expired | Auto-refresh |
| `AUTH_INVALID_CREDENTIALS` | 401 | Bad email/password | Show error |
| `AUTH_USER_PENDING` | 403 | Account not yet approved | Show pending screen |
| `AUTH_USER_SUSPENDED` | 403 | Account suspended | Show blocked screen |
| `AUTHZ_ROLE_INSUFFICIENT` | 403 | Role too low | Hide UI for this action |
| `AUTHZ_CAMPAIGN_MISSING` | 400 | No x-campaign-id | Set campaign context |
| `AUTHZ_CAMPAIGN_DENIED` | 403 | Not a member of campaign | Switch campaign |
| `VALIDATION_ERROR` | 400 | Bad payload | Fix request body |
| `RATE_LIMITED` | 429 | Too many requests | Back off |
| `NOT_FOUND` | 404 | Resource doesn't exist | Handle gracefully |
| `INVALID_TOKEN` | 401 | Bad x-agent-token | Check config |
| `TRACKING_BACKPRESSURE` | 503 | Queue full | Retry later |
| `FORMS_BACKPRESSURE` | 503 | Queue full | Retry later |

### Full Error Codes List

See `apps/backend/src/contracts/api-types.ts` — the `ErrorCode` type has the complete list of ~60 error codes organized by category.

---

## 12. TypeScript Types

The shared type contracts file is at:

```
apps/backend/src/contracts/api-types.ts
```

This file (~990 lines) contains every request/response type for the entire API. Copy or symlink it into your project:

```typescript
// Import examples
import type {
  LoginRequest, LoginResponse,
  FormSubmissionInput, FormSubmission,
  AgentLocationInput, AgentLive,
  Zone, ZoneGeoJsonResponse,
  OrgNodeWithUser, CreateOrgNodeRequest,
  Invitation, CreateInvitationRequest,
  Role, ROLE_HIERARCHY,
  ApiResponse, ApiError, ErrorCode,
} from "@goberna/contracts/api-types";
```

### Key Types Quick Reference

```typescript
// Roles
type Role = "admin" | "consultor" | "jefe_campana" | "brigadista_zonal" | "agente_campo";

// Form submission (new JSONB system)
type FormSubmissionInput = {
  client_id: string;             // UUID for dedupe
  data: Record<string, unknown>; // Free-form JSONB
  form_definition_id?: string;
  campaign_id?: string;
  meet_id?: string;
  lat?: number;
  lng?: number;
};

// Agent location
type AgentLocationInput = {
  agent_id: string;
  ts: string;         // ISO timestamp
  lat: number;
  lng: number;
  seq: number;         // Monotonic sequence
  accuracy?: number;
  speed?: number;
  heading?: number;
  battery?: number;
  campaign_id?: string;
};

// Zone
type Zone = {
  id: string;
  campaign_id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  color: string;
  assigned_to: string | null;
  metadata: Record<string, unknown>;
};

// Meet statuses and transitions
type MeetStatus = "pending_location" | "scheduled" | "active" | "completed" | "cancelled";
// pending_location -> scheduled -> active -> completed
//                                         -> cancelled (from any non-terminal)
```

---

## Appendix: Environment Variables

### Backend

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `REDIS_URL` | yes | — | Redis connection string |
| `JWT_SECRET` | yes | — | Min 32 characters |
| `AGENT_INGEST_TOKEN` | yes (prod) | — | Shared secret for tracking |
| `PORT` | no | `3001` | API port |
| `LOG_LEVEL` | no | `info` | Logging level |
| `TEGOLA_BASE_URL` | no | `http://localhost:8080` | Tegola tile server |
| `RATE_LIMIT_AUTH_PER_MINUTE` | no | `10` | Login/register rate limit |
| `REFRESH_TOKEN_CLEANUP_INTERVAL_MS` | no | `3600000` | Cleanup interval |
| `LOCATION_HISTORY_RETENTION_DAYS` | no | `7` | GPS history retention |
| `REDIS_PASSWORD` | no | — | Auto-injected into REDIS_URL if missing |

### Mobile (app.json > extra)

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_BACKEND_API_URL` | Backend base URL |
| `EXPO_PUBLIC_AGENT_INGEST_TOKEN` | Tracking auth token |

# Expo Candidate Profile — Remote Config Spec

**Date:** 2026-02-16
**Status:** Spec only (implementation deferred)
**Scope:** How Expo app dynamically creates candidate profiles from admin config

---

## 1. Overview

When an admin creates a new candidate in nexus-web, the Expo app should automatically show that candidate's profile without requiring an app update. This is achieved through a remote config pattern.

---

## 2. Flow

```
Admin creates candidate in nexus-web
  → POST /api/campaigns (backend creates campaign record)
  → Backend stores: name, cargo, numero, partido, foto_url, logo_partido_url, color, form_definitions[]

Expo app on launch or pull-to-refresh
  → GET /api/candidates (public or auth-gated)
  → Receives list of candidates with their config
  → Renders candidate selection screen dynamically
  → User selects candidate → app configures itself for that campaign
```

---

## 3. Candidate Config Schema

```typescript
type CandidateConfig = {
  id: string;
  name: string;
  slug: string;
  cargo: string;                  // "Alcalde", "Regidor", etc.
  numero: number;                 // Candidacy number
  partido: string;                // Party name
  foto_url: string | null;        // Candidate photo URL
  logo_partido_url: string | null;// Party logo URL
  color_primario: string;         // Hex color for theming the app
  color_secundario: string;       // Hex color secondary
  status: "active" | "paused";

  // Form definitions for this candidate
  form_definitions: FormDefinitionRef[];
};

type FormDefinitionRef = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "active" | "draft" | "archived";
  schema_url: string;             // URL to fetch full JSON schema
};
```

---

## 4. Dynamic Form Rendering in Expo

The form builder in nexus-web (`/formularios`) already generates a JSON schema with this structure:

```typescript
type FormSchema = {
  version: string;
  fields: FormField[];
};

type FormField = {
  id: string;
  type: "text" | "number" | "email" | "phone" | "textarea" | "select" | "radio" | "checkbox" | "date" | "location" | "photo";
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    options?: string[];
  };
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
};
```

### Expo rendering strategy

1. Fetch active form definitions for the selected candidate
2. For each form, fetch the full JSON schema
3. Render fields dynamically using a `<DynamicField type={field.type} .../>` component mapper
4. Validate inputs according to the schema's validation rules
5. Submit to `POST /api/forms` with `campaign_id` and `form_definition_id`

### Field type → Expo component mapping

| Schema type | Expo Component                     |
|-------------|------------------------------------|
| text        | `<TextInput />`                    |
| number      | `<TextInput keyboardType="numeric" />` |
| email       | `<TextInput keyboardType="email" />`   |
| phone       | `<TextInput keyboardType="phone" />`   |
| textarea    | `<TextInput multiline />`          |
| select      | `<Picker />` or bottom sheet       |
| radio       | Custom radio group                 |
| checkbox    | Custom checkbox group              |
| date        | `<DateTimePicker />`               |
| location    | Auto-capture GPS + manual override |
| photo       | Camera/gallery picker              |

---

## 5. Candidate Theming

When a user selects a candidate in Expo, the app applies the candidate's brand colors:

- `color_primario` → header background, primary buttons, accent
- `color_secundario` → secondary buttons, borders, highlights
- `foto_url` → displayed in profile header
- `logo_partido_url` → displayed in corner badge

This allows each candidate to have a branded experience without separate builds.

---

## 6. Caching Strategy

- Candidate list: cache 5 minutes, refresh on pull-to-refresh
- Form schemas: cache until version changes (compare `schema.version`)
- Images: standard HTTP cache headers via CDN

---

## 7. Offline Behavior

- Candidate config cached in AsyncStorage/MMKV on first successful fetch
- Form schemas cached locally
- Submissions queued in local storage when offline
- Sync when connectivity returns (existing pattern in the Expo app)

---

## 8. Security

- Candidate list endpoint may be public (for onboarding) or require auth token
- Form submission requires auth token + `AGENT_INGEST_TOKEN` header
- Form schemas are read-only for agents
- Admin-only endpoints for CRUD operations

---

## 9. Backend Endpoints Required (future implementation)

| Method | Endpoint                              | Description                        |
|--------|---------------------------------------|------------------------------------|
| GET    | `/api/candidates`                     | List active candidates (public)    |
| GET    | `/api/candidates/:id`                 | Single candidate config            |
| POST   | `/api/campaigns`                      | Create campaign (admin only)       |
| PUT    | `/api/campaigns/:id`                  | Update campaign (admin only)       |
| GET    | `/api/form-definitions?campaign_id=X` | List forms for campaign            |
| GET    | `/api/form-definitions/:id/schema`    | Full JSON schema for a form        |
| POST   | `/api/forms`                          | Submit form data (agent)           |

Most of these already exist or partially exist in the current backend.

---

## 10. Implementation Priority

1. Backend: ensure `POST /api/campaigns` accepts all new fields (foto, logo, colors)
2. Backend: add `logo_partido_url` and `color_*` columns to campaigns table
3. Expo: build `<DynamicFormRenderer schema={schema} />` component
4. Expo: build candidate selection with remote config
5. Expo: implement theming from candidate colors
6. Expo: offline queue for form submissions (partially exists)

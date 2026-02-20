/**
 * GOBERNA — Formularios: Shared Types
 */

export type Campaign = {
  id: string;
  name: string;
  slug: string;
  cargo: string | null;
  numero: number | null;
};

export type FieldType =
  | "text"
  | "number"
  | "email"
  | "phone"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "date"
  | "location"
  | "photo";

export type FormField = {
  id: string;
  type: FieldType;
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

export type FormSchema = {
  version: string;
  fields: FormField[];
};

export type FormDefinition = {
  id: string;
  campaign_id: string;
  name: string;
  slug: string;
  description: string | null;
  schema: FormSchema;
  status: "draft" | "active" | "archived";
  created_at: string;
  campaign_name?: string;
};

export const FIELD_TYPES: { value: FieldType; label: string; icon: string }[] = [
  { value: "text", label: "Texto corto", icon: "T" },
  { value: "textarea", label: "Texto largo", icon: "¶" },
  { value: "number", label: "Número", icon: "#" },
  { value: "email", label: "Email", icon: "@" },
  { value: "phone", label: "Teléfono", icon: "☎" },
  { value: "select", label: "Selección única", icon: "▾" },
  { value: "radio", label: "Opción única (radio)", icon: "◉" },
  { value: "checkbox", label: "Selección múltiple", icon: "☑" },
  { value: "date", label: "Fecha", icon: "📅" },
  { value: "location", label: "Ubicación GPS", icon: "📍" },
  { value: "photo", label: "Foto", icon: "📷" },
];

export const DEFAULT_FIELDS: FormField[] = [
  {
    id: "nombre",
    type: "text",
    label: "Nombre completo",
    placeholder: "Ingresa nombre y apellidos",
    required: true,
    validation: { min: 3 },
  },
  {
    id: "telefono",
    type: "phone",
    label: "Teléfono",
    placeholder: "999 888 777",
    required: true,
    validation: { pattern: "^[0-9]{9}$" },
  },
  {
    id: "ubicacion",
    type: "location",
    label: "Ubicación GPS",
    required: true,
  },
];

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

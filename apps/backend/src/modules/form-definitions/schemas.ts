import { z } from "zod";

// ── Field types ─────────────────────────────────────────────────────

const fieldTypeSchema = z.enum([
  "text",
  "number",
  "email",
  "phone",
  "textarea",
  "select",
  "radio",
  "checkbox",
  "date",
  "location",
  "photo",
]);

// Validation rules per field type
const fieldValidationSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  options: z.array(z.string()).optional(),
}).optional();

const fieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

const formFieldSchema = z.object({
  id: z.string().min(1, "Field ID es requerido"),
  type: fieldTypeSchema,
  label: z.string().min(1, "Label es requerido"),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  required: z.boolean().optional().default(false),
  validation: fieldValidationSchema,
  options: z.array(fieldOptionSchema).optional(),
  defaultValue: z.unknown().optional(),
  conditionalOn: z.object({
    fieldId: z.string(),
    value: z.unknown(),
  }).optional(),
});

const formSchemaSchema = z.object({
  version: z.string().optional().default("1.0"),
  fields: z.array(formFieldSchema),
});

// ── API Schemas ───────────────────────────────────────────────────

export const createFormDefinitionSchema = z.object({
  campaign_id: z.string().uuid("campaign_id invalido"),
  name: z.string().min(1, "nombre requerido").max(100),
  slug: z.string().min(1, "slug requerido").max(100).regex(/^[a-z0-9-]+$/, "slug debe ser lowercase con guiones"),
  description: z.string().max(500).optional(),
  schema: formSchemaSchema,
});

export const updateFormDefinitionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "slug debe ser lowercase con guiones").optional(),
  description: z.string().max(500).optional().nullable(),
  schema: formSchemaSchema.optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
});

export const formDefinitionResponseSchema = z.object({
  id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  schema: formSchemaSchema,
  status: z.enum(["draft", "active", "archived"]),
  created_by: z.string().uuid().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  // Joined
  campaign_name: z.string().optional(),
  campaign_slug: z.string().optional(),
  created_by_name: z.string().optional(),
});

export const listFormDefinitionsQuerySchema = z.object({
  campaign_id: z.string().uuid().optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
});

// ── Types ─────────────────────────────────────────────────────────

export type CreateFormDefinitionInput = z.infer<typeof createFormDefinitionSchema>;
export type UpdateFormDefinitionInput = z.infer<typeof updateFormDefinitionSchema>;
export type FormDefinitionResponse = z.infer<typeof formDefinitionResponseSchema>;
export type FormField = z.infer<typeof formFieldSchema>;
export type FormSchema = z.infer<typeof formSchemaSchema>;

import { z } from "zod";

// El wizard SetupFlow envía datos crudos: fullName combinado, partido como
// texto, cargo como código, geo como strings. nexus-control reenvía esto
// (más sus IDs internos de tenant/candidato) a este endpoint.

export const provisionedSchema = z.object({
  // ── Idempotency ─────────────────────────────────────────────────
  // UNIQUE en candidatos.postulacion → retry safe.
  nexus_tenant_id: z.string().trim().min(1).max(100),
  nexus_candidato_id: z.string().trim().min(1).max(100).optional(),

  // ── Identidad del candidato (PII) ──────────────────────────────
  // El wizard manda fullName combinado. Lo guardamos completo en nombres
  // y dejamos apellidos null (el candidato lo separa post-login).
  full_name: z.string().trim().min(2).max(400),
  // pais_codigo iso2; default PE si no viene
  pais_codigo: z.string().trim().length(2).toUpperCase().default("PE"),
  documento_tipo: z.enum(["DNI", "CE", "PASAPORTE"]).default("DNI"),
  documento_numero: z.string().trim().max(50).optional(),
  fecha_nacimiento: z.string().date().optional(),
  sexo: z.enum(["M", "F", "X"]).optional(),
  // E.164 con o sin '+'. Normalizado a sin-'+' para alinear con
  // campaigns.config.whatsapp_number convention (9-15 dígitos).
  telefono_e164: z
    .string()
    .trim()
    .regex(/^\+?\d{8,15}$/, "telefono_e164 debe ser 8-15 dígitos con o sin '+'")
    .optional(),
  // Required: el endpoint crea un users row + user_campaigns y necesita email
  // como natural key. nexus aprovisiona un mailbox Mailu por tenant antes de
  // invocar este endpoint, así que siempre hay email.
  email: z.string().email().max(200),
  // Foto del candidato (data URL base64 o http URL). Cap a 750KB. Renderiza
  // en el deck de Fase 2 — ver wizardInputSchema más abajo.
  foto_url: z.string().max(750_000).optional(),

  // ── Postulación (códigos resueltos a IDs server-side) ──────────
  rol_campana_codigo: z.enum(["candidato", "estratega"]).default("candidato"),
  cargo_codigo: z.string().trim().min(1).max(100),
  organizacion_politica_codigo: z.string().trim().max(100).optional(),
  // Geo: integers ya resueltos por quien llama (nexus). Sin FK aún (geografia_politica
  // viene en otro PR). El endpoint sí valida que cuadren con cargo.ambito_geografico.
  id_departamento: z.number().int().positive().optional(),
  id_provincia: z.number().int().positive().optional(),
  id_distrito: z.number().int().positive().optional(),

  // ── Campaign (denormalized + config) ───────────────────────────
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "slug debe ser lowercase alphanumeric con guiones"),
  partido_text: z.string().trim().max(200).optional(), // legacy campaigns.partido
  numero: z.number().int().positive().optional(), // ballot number, opcional
  slogan: z.string().trim().max(140).optional(),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "primary_color debe ser hex #rrggbb")
    .optional(),

  // ── Datos del provisioning de nexus (van a campaigns.config) ───
  domain: z.string().trim().max(200).optional(),
  site_url: z.string().url().max(500).optional(),
  mailbox_email: z.string().email().max(200).optional(),
  billing_email: z.string().email().max(200).optional(),
});

export type ProvisionedInput = z.infer<typeof provisionedSchema>;

// ── Wizard público ─────────────────────────────────────────────────────
// Body que envía el wizard /onboarding del frontend principal (apps/web).
// No requiere service-token ni nexus_tenant_id: el endpoint genera ambos
// internamente. Sin DNS, hosting, mailbox — solo crea la cuenta del
// candidato + campaign mínima para que entre al dashboard.

export const wizardInputSchema = z.object({
  // Identidad
  first_name: z.string().trim().min(1).max(120),
  last_name: z.string().trim().min(1).max(120),
  country: z.string().trim().length(2).toUpperCase().default("PE"),
  documento_numero: z.string().trim().max(50).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d{8,15}$/, "phone debe ser 8-15 dígitos con o sin '+'")
    .optional(),

  // Rol + cargo
  rol_campana_codigo: z.enum(["candidato", "estratega"]).default("candidato"),
  cargo_codigo: z.string().trim().min(1).max(100),
  organizacion_politica_codigo: z.string().trim().max(100).optional(),

  // Jurisdicción (cascada — opcional según ámbito del cargo)
  id_departamento: z.number().int().positive().optional(),
  id_provincia: z.number().int().positive().optional(),
  id_distrito: z.number().int().positive().optional(),

  // Contraseña que el candidato elige al final del wizard. Opcional —
  // si no viene, la cuenta queda solo con OTP/magic-link.
  password: z.string().min(8).max(200).optional(),

  // Foto del candidato — data URL (base64) o URL externa. Cap a 750KB para
  // que el payload del wizard no se vuelva pesado. Se guarda en
  // candidatos.candidato.foto_url y la consume el deck de Fase 2.
  foto_url: z.string().max(750_000).optional(),
});

export type WizardInput = z.infer<typeof wizardInputSchema>;

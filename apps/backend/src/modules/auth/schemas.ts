import { z } from "zod";

/**
 * Login schema - supports email OR phone as identifier
 * - Candidatos and admins login with email
 * - Brigadistas and agentes can login with phone or email
 */
export const loginSchema = z.object({
  // Can be email or phone number
  identifier: z.string().min(1, "email o telefono requerido").transform((val) => val.toLowerCase().trim()),
  password: z.string().min(1, "password requerido"),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, "refresh token requerido"),
});

/**
 * Set-initial-password schema. Solo válido si user.password_hash IS NULL
 * (caso típico: cuenta creada por wizard onboarding sin contraseña).
 */
export const setInitialPasswordSchema = z.object({
  new_password: z.string().min(8, "password debe tener al menos 8 caracteres").max(200),
});

/**
 * Register schema - phone is primary, email is optional
 * - phone: Required, will be used as login identifier
 * - email: Optional, for users who want email notifications
 * - Internally generates email as {phone}@goberna.pe if not provided
 *
 * Para registro OTP-only (sin password) usar /api/auth/register-firebase
 * (endpoint dedicado, ver routes.ts).
 */
export const registerSchema = z.object({
  phone: z.string().trim().min(9, "telefono requerido").max(20, "telefono demasiado largo"),
  password: z.string().min(8, "password debe tener al menos 8 caracteres"),
  full_name: z.string().trim().min(1, "nombre requerido").max(200, "nombre demasiado largo"),
  region: z.string().trim().min(1, "region requerida").max(50, "region invalida"),
  campaign_id: z.string().uuid("candidato requerido"),
  // Email is optional - if not provided, we generate {phone}@goberna.pe
  email: z.string().email("email invalido").transform((e) => e.toLowerCase().trim()).optional(),
  // Invitation code - optional, validated and consumed during registration
  invitation_code: z.string().trim().toUpperCase().optional(),
  // Access code de campaña (4 chars) - alternativa simple al invitation_code
  // Si se provee, se valida contra campaign_access_codes y el campaign_id debe coincidir
  access_code: z.string().trim().toUpperCase().max(4).optional(),
});

/**
 * Register schema OTP-only via Firebase (POST /api/auth/register-firebase).
 * El phone se deriva del id_token (no del body) para evitar spoofing.
 * Exactly one of {invitation_code, access_code, campaign_id} debe venir.
 */
export const registerFirebaseSchema = z.object({
  id_token: z.string().min(50, "firebase id_token requerido"),
  full_name: z.string().trim().min(3, "nombre requerido (min 3)").max(200, "nombre demasiado largo"),
  region: z.string().trim().min(1, "region requerida").max(50, "region invalida"),
  // Mutually exclusive — checked en el handler
  invitation_code: z.string().trim().toUpperCase().optional(),
  access_code: z.string().trim().toUpperCase().max(4).optional(),
  campaign_id: z.string().uuid("campaign_id invalido").optional(),
  email: z.string().email("email invalido").transform((e) => e.toLowerCase().trim()).optional(),
}).refine(
  (data) => [data.invitation_code, data.access_code, data.campaign_id].filter(Boolean).length === 1,
  { message: "exactly one of invitation_code, access_code, campaign_id requerido", path: ["campaign_id"] },
);

/**
 * WhatsApp OTP — schemas para los 3 endpoints (send / verify-login / register).
 *
 * El phone es trim + dígitos (validamos en el módulo whatsapp-otp con
 * normalizePhone). 9-15 dígitos cubre PE (9 local) y E.164 mundial.
 */
export const whatsappSendSchema = z.object({
  phone: z.string().trim().min(9, "telefono requerido").max(20, "telefono demasiado largo"),
});

export const whatsappVerifyLoginSchema = z.object({
  phone: z.string().trim().min(9, "telefono requerido").max(20),
  code: z.string().regex(/^\d{6}$/, "código debe ser 6 dígitos"),
});

export const whatsappRegisterSchema = z.object({
  phone: z.string().trim().min(9, "telefono requerido").max(20),
  code: z.string().regex(/^\d{6}$/, "código debe ser 6 dígitos"),
  full_name: z.string().trim().min(3, "nombre requerido (min 3)").max(200),
  region: z.string().trim().min(1, "region requerida").max(50),
  invitation_code: z.string().trim().toUpperCase().optional(),
  access_code: z.string().trim().toUpperCase().max(4).optional(),
  campaign_id: z.string().uuid("campaign_id invalido").optional(),
  email: z.string().email("email invalido").transform((e) => e.toLowerCase().trim()).optional(),
}).refine(
  (data) => [data.invitation_code, data.access_code, data.campaign_id].filter(Boolean).length === 1,
  { message: "exactly one of invitation_code, access_code, campaign_id requerido", path: ["campaign_id"] },
);

/**
 * Join-campaign schema — para users autenticados sin campaña asignada.
 * Recibe access_code (4 chars) y crea/reactiva user_campaign como agente_campo.
 */
export const joinCampaignSchema = z.object({
  access_code: z.string().trim().toUpperCase().min(4, "código de 4 caracteres").max(4),
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, "password actual requerido"),
  new_password: z.string().min(8, "nueva password debe tener al menos 8 caracteres"),
});

/**
 * Reset password schema - for users who were marked for password reset
 * Used when user logs in and backend returns password_reset_required: true
 */
export const resetPasswordSchema = z.object({
  // Identifier (phone or email) to find the user
  identifier: z.string().min(1, "telefono o email requerido").transform((val) => val.toLowerCase().trim()),
  // Current password to verify identity
  current_password: z.string().min(1, "password actual requerido"),
  // New password
  new_password: z.string().min(8, "nueva password debe tener al menos 8 caracteres"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RegisterFirebaseInput = z.infer<typeof registerFirebaseSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type WhatsappSendInput = z.infer<typeof whatsappSendSchema>;
export type WhatsappVerifyLoginInput = z.infer<typeof whatsappVerifyLoginSchema>;
export type WhatsappRegisterInput = z.infer<typeof whatsappRegisterSchema>;
export type JoinCampaignInput = z.infer<typeof joinCampaignSchema>;

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
 * Register schema - phone is primary, email is optional
 * - phone: Required, will be used as login identifier
 * - email: Optional, for users who want email notifications
 * - Internally generates email as {phone}@goberna.pe if not provided
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
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

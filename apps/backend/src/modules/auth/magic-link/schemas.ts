import { z } from "zod";

export const magicLinkPurposeSchema = z.enum(["login", "team_invite", "password_reset"]);
export type MagicLinkPurpose = z.infer<typeof magicLinkPurposeSchema>;

export const requestMagicLinkSchema = z.object({
  // Phone E.164 sin '+' (alineado con users.phone y candidatos.candidato.telefono_e164)
  phone_e164: z
    .string()
    .trim()
    .regex(/^\d{8,15}$/, "phone_e164 debe ser 8-15 dígitos sin '+'"),
  purpose: magicLinkPurposeSchema.default("login"),
  // URL absoluta o relativa donde landea el browser tras consume.
  // Si vacía, default a /candidatos/<slug>/<canal> derivado del user.
  redirect_url: z.string().trim().max(500).optional(),
  expires_in_hours: z.number().int().positive().max(168).default(24),
});

export const consumeMagicLinkSchema = z.object({
  token: z.string().trim().min(32).max(128),
});

export type RequestMagicLinkInput = z.infer<typeof requestMagicLinkSchema>;
export type ConsumeMagicLinkInput = z.infer<typeof consumeMagicLinkSchema>;

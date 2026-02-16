import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("email invalido").transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1, "password requerido"),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, "refresh token requerido"),
});

export const registerSchema = z.object({
  email: z.string().email("email invalido").transform((e) => e.toLowerCase().trim()),
  password: z.string().min(8, "password debe tener al menos 8 caracteres"),
  full_name: z.string().trim().min(1, "nombre requerido").max(200, "nombre demasiado largo"),
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, "password actual requerido"),
  new_password: z.string().min(8, "nueva password debe tener al menos 8 caracteres"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

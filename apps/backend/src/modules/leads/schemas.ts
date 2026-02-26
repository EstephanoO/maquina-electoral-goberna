import { z } from "zod";

export const createLeadSchema = z.object({
  nombre: z.string().trim().min(1).max(255),
  correo: z.string().trim().email().max(255),
  plataforma: z.enum(["iphone", "android"]).default("iphone"),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export type LeadRow = {
  id: string;
  nombre: string;
  correo: string;
  plataforma: string;
  created_at: string;
};

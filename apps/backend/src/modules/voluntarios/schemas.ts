import { z } from "zod";

export const RANGOS_EDAD = ["18-25", "26-35", "36-45"] as const;
export type RangoEdad = (typeof RANGOS_EDAD)[number];

export const createVoluntarioSchema = z.object({
  nombre_completo: z.string().trim().min(2).max(255),
  telefono: z
    .string()
    .trim()
    .min(7)
    .max(30)
    .regex(/^[0-9+\s\-()]+$/, "Telefono invalido"),
  departamento: z.string().trim().min(1).max(100),
  provincia: z.string().trim().min(1).max(100),
  distrito: z.string().trim().min(1).max(100),
  rango_edad: z.enum(RANGOS_EDAD),
  candidato_slug: z.string().trim().min(1).max(100).optional(),
});

export type CreateVoluntarioInput = z.infer<typeof createVoluntarioSchema>;

export type VoluntarioRow = {
  id: string;
  nombre_completo: string;
  telefono: string;
  departamento: string;
  provincia: string;
  distrito: string;
  rango_edad: string;
  candidato_id: string | null;
  candidato_slug: string | null;
  created_at: string;
};

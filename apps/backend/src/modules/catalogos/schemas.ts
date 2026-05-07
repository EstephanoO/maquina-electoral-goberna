import { z } from "zod";

export const cargosQuerySchema = z.object({
  pais: z.string().trim().length(2).toUpperCase().default("PE"),
  nivel: z.string().trim().min(1).max(50).optional(),
});

export const organizacionesPoliticasQuerySchema = z.object({
  pais: z.string().trim().length(2).toUpperCase().default("PE"),
});

export const jurisdiccionesQuerySchema = z.object({
  ambito: z.enum(["departamento", "provincia", "distrito"]),
  parent_id: z.coerce.number().int().positive().optional(),
});

export type CargosQuery = z.infer<typeof cargosQuerySchema>;
export type OrganizacionesPoliticasQuery = z.infer<typeof organizacionesPoliticasQuerySchema>;
export type JurisdiccionesQuery = z.infer<typeof jurisdiccionesQuerySchema>;

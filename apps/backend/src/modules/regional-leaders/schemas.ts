import { z } from "zod";

export const createRegionalLeaderSchema = z.object({
  nombres: z.string().trim().min(1).max(120),
  apellidos: z.string().trim().min(1).max(120),
  departamento: z.string().trim().min(1).max(100),
  provincia: z.string().trim().min(1).max(100),
  distrito: z.string().trim().min(1).max(100),
  dni: z.string().trim().regex(/^\d{8}$/, "DNI debe tener exactamente 8 digitos"),
  celular: z.string().trim().regex(/^\d{9}$/, "Celular debe tener exactamente 9 digitos"),
  direccion_domicilio: z.string().trim().min(1).max(255),
});

export const listRegionalLeadersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateRegionalLeaderInput = z.infer<typeof createRegionalLeaderSchema>;
export type ListRegionalLeadersQuery = z.infer<typeof listRegionalLeadersQuerySchema>;

export type RegionalLeaderRow = {
  id: string;
  nombres: string;
  apellidos: string;
  departamento: string;
  provincia: string;
  distrito: string;
  dni: string;
  celular: string;
  direccion_domicilio: string;
  created_at: string;
};

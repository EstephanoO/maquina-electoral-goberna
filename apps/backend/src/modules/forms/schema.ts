import { z } from "zod";

export const formSchema = z.object({
  nombre: z.string().trim().min(1),
  telefono: z.string().trim().min(1),
  fecha: z.string().datetime(),
  x: z.coerce.number().finite().gt(0).min(100000).max(900000),
  y: z.coerce.number().finite().gt(0).min(1).max(10000000),
  zona: z.string().trim().min(1),
  candidate: z.string().trim().optional().default(""),
  encuestador: z.string().trim().min(1),
  encuestador_id: z.string().trim().min(1),
  candidato_preferido: z.string().trim().min(1),
  client_id: z.string().trim().min(1),
  home_maps_url: z.string().trim().optional(),
  polling_place_url: z.string().trim().optional(),
  comentarios: z.string().trim().optional(),
});

export type FormInput = z.infer<typeof formSchema>;

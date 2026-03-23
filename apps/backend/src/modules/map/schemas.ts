import { z } from "zod";

// ── Route params ──────────────────────────────────────────────────
export const provinciasParams = z.object({
  coddep: z.string().length(2),
});

export const distritosParams = z.object({
  codprov_full: z.string().length(4),
});

export const geometryParams = z.object({
  level: z.enum(["dep", "prov", "dist"]),
  code: z.string().min(1).max(10),
});

export const tileParams = z.object({
  z: z.coerce.number().int().min(0).max(22),
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
});

// ── Query strings ─────────────────────────────────────────────────
export const reverseGeocodeQuery = z.object({
  lng: z.coerce.number().min(-82).max(-68),
  lat: z.coerce.number().min(-19).max(1),
});

export const searchDistritosQuery = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

import { z } from "zod";

export const validateCodeParams = z.object({
  code: z.string().min(1).max(64).trim(),
});

export const campaignIdParams = z.object({
  campaignId: z.string().uuid(),
});

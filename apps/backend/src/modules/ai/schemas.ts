import { z } from "zod";

export const classifySchema = z.object({
  text: z.string().min(10).max(2000),
  conversation_context: z.string().max(3000).optional(),
});

export const spamCheckSchema = z.object({
  own_number: z.string().max(20).optional(),
  messages: z
    .array(
      z.object({
        text: z.string().max(1000),
        timestamp: z.number(),
        to_phone: z.string().max(20).optional(),
      }),
    )
    .min(1)
    .max(200),
});

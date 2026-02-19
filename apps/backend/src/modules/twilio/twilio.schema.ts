/**
 * GOBERNA — Twilio Module Schemas (Zod)
 */
import { z } from "zod";

export const sendWhatsAppSchema = z.object({
  contact_id: z.string().uuid("contact_id debe ser un UUID"),
  campaign_id: z.string().uuid("campaign_id debe ser un UUID"),
  body: z
    .string()
    .min(1, "El mensaje no puede estar vacío")
    .max(1600, "El mensaje excede el límite de 1600 caracteres de WhatsApp"),
});

export const contactIdParamSchema = z.object({
  contactId: z.string().uuid("contactId debe ser un UUID"),
});

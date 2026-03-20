import { z } from "zod";

export const markHabladoSchema = z.object({
  ids:       z.array(z.string().uuid()).min(1).max(200),
  no_wa_ids: z.array(z.string().uuid()).max(200).optional(),  // sin WhatsApp — reintentar mañana
});

export const blastReportItemSchema = z.object({
  phone:        z.string().max(20),
  contact_name: z.string().max(200).optional(),
  message:      z.string().max(600).optional(),
  status:       z.enum(["sent", "failed", "no_wa"]),
  error:        z.string().max(300).nullable().optional(),
  own_number:   z.string().max(20).nullable().optional(),
  contact_id:   z.string().uuid().nullable().optional(),
  block_id:     z.string().max(50).nullable().optional(),  // ID del bloque de 50
});

export const blastReportSchema = z.object({
  results: z.array(blastReportItemSchema).min(1).max(100),
});

// POST /api/blast/number-config — register a WA number as a blast slot
export const numberConfigSchema = z.object({
  wa_number:   z.string().min(10).max(20),
  label:       z.string().max(100).optional(),
  segment_idx: z.number().int().min(0).max(29),  // slot 0-29
  total_slots: z.number().int().min(1).max(30),
});

// POST /api/blast/report-conversation
// Called by the extension immediately after a blast message is sent.
// Stores jid→phone mapping and creates/updates the conversations entry.
export const reportConversationSchema = z.object({
  jid:          z.string().min(1).max(100),
  own_number:   z.string().min(1).max(20),
  phone:        z.string().min(1).max(20),
  contact_name: z.string().max(200).optional(),
});

// GET /api/blast/resolve-phone?jid=xxx
// Called by the extension on incoming reply. Looks up phone by JID.
export const resolvePhoneSchema = z.object({
  jid: z.string().min(1).max(100),
});

// POST /api/blast/check-contacts — Capa 5 anti-duplicado
// Recibe una lista de {id, phone} y devuelve los que siguen siendo 'nuevo'.
// Se llama antes de procesar cada batch para detectar contactos marcados
// 'hablado' por OTRO phone mientras este corre.
export const checkContactsSchema = z.object({
  contacts: z.array(z.object({
    id:    z.string().uuid(),
    phone: z.string().max(20),
  })).min(1).max(100),
});

// POST /api/blast/report-skips — Capa 6 visibilidad
// Registra en blast_log los contactos que se saltaron y por qué.
// Permite ver en el dashboard qué se saltó y por cuál razón.
export const reportSkipsSchema = z.object({
  skips: z.array(z.object({
    contact_id:     z.string().uuid().nullable(),
    phone:          z.string().max(20),
    contact_phone:  z.string().max(20),
    contact_name:   z.string().max(200).nullable(),
    reason:         z.string().max(100),
  })).min(1).max(200),
});

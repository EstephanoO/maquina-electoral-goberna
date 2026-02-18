import { z } from "zod";

export const formSubmissionSchema = z.object({
  form_definition_id: z.string().uuid().optional(),
  campaign_id: z.string().uuid().optional(),
  meet_id: z.string().uuid().optional(),
  meet_group_id: z.string().uuid().optional(),
  data: z.record(z.string(), z.unknown()),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  client_id: z.string().trim().min(1),
});

export type FormSubmissionInput = z.infer<typeof formSubmissionSchema>;

export const formSubmissionBatchSchema = z.object({
  submissions: z.array(formSubmissionSchema).min(1).max(200),
});

export type FormSubmissionBatchInput = z.infer<typeof formSubmissionBatchSchema>;

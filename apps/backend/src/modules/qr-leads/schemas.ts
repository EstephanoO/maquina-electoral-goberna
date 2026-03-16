import { z } from "zod";

// POST /api/qr-leads/scan — called by mobile app after the user's QR is shown
// The brigadista_id comes from the JWT, not the body.
export const recordScanSchema = z.object({
  // Optional — if the person who scanned left a phone (captured later)
  phone:        z.string().max(20).optional(),
  message_text: z.string().max(500).optional(),
  scan_source:  z.enum(["qr", "link", "manual"]).optional().default("qr"),
});

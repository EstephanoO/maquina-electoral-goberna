/**
 * GOBERNA — Twilio WhatsApp Module Types
 */

export type MessageDirection = "outbound" | "inbound";

export type MessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "undelivered"
  | "received";

export type TwilioMessage = {
  id: string;
  contact_id: string;
  campaign_id: string;
  direction: MessageDirection;
  body: string;
  twilio_sid: string | null;
  status: MessageStatus;
  sent_by: string | null;
  created_at: Date;
};

/** Body for POST /api/twilio/whatsapp/send */
export type SendWhatsAppBody = {
  contact_id: string;
  campaign_id: string;
  body: string;
};

/** Twilio webhook payload (form-encoded, key fields) */
export type TwilioWebhookPayload = {
  MessageSid?: string;
  SmsSid?: string;
  SmsStatus?: string;
  MessageStatus?: string;
  Body?: string;
  From?: string;
  To?: string;
  NumMedia?: string;
};

/**
 * GOBERNA — CMS Event Bus
 *
 * Lightweight in-process event emitter for cross-module SSE broadcasting.
 * Allows the Twilio module (and others) to notify the CMS SSE stream
 * about new messages without a direct import dependency on cms/routes.
 *
 * Usage:
 *   - Publisher:  cmsEvents.emit("message.new", { campaignId, contactId, message })
 *   - Subscriber: cmsEvents.on("message.new", (payload) => broadcastToCampaign(...))
 */

import { EventEmitter } from "node:events";

export type CmsMessageEvent = {
  campaignId: string;
  contactId: string;
  direction: "inbound" | "outbound";
  messageId: string;
};

export type CmsStatusUpdateEvent = {
  campaignId: string;
  contactId: string;
  twilioSid: string;
  status: string;
};

/**
 * Event emitted when the Chrome extension detects an inbound message
 * in WhatsApp Web via DOM observation. Not a Twilio webhook — this
 * is a "best effort" signal from the operator's browser.
 */
export type CmsExtensionMessageEvent = {
  campaignId: string;
  contactId: string;
  phone: string | null;
  preview: string;
  detectedAt: number;
  operatorId: string;
};

export interface CmsEventMap {
  "message.new": CmsMessageEvent;
  "message.status": CmsStatusUpdateEvent;
  "extension.message_received": CmsExtensionMessageEvent;
  "extension.message_sent": CmsExtensionMessageEvent;
}

class CmsEventBus extends EventEmitter {
  emitCms<K extends keyof CmsEventMap>(event: K, payload: CmsEventMap[K]): boolean {
    return this.emit(event, payload);
  }

  onCms<K extends keyof CmsEventMap>(event: K, listener: (payload: CmsEventMap[K]) => void): this {
    return this.on(event, listener);
  }
}

/** Singleton event bus for CMS cross-module communication */
export const cmsEvents = new CmsEventBus();

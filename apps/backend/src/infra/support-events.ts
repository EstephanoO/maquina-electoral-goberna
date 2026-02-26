/**
 * GOBERNA — Support Chat Event Bus
 *
 * Lightweight in-process event emitter for support chat WebSocket broadcasting.
 * Allows the REST routes to notify the WS handler about new messages.
 *
 * Usage:
 *   - Publisher:  supportEvents.emitSupport("message.new", { ... })
 *   - Subscriber: supportEvents.onSupport("message.new", (payload) => ...)
 */

import { EventEmitter } from "node:events";

export type SupportMessageEvent = {
  id: string;
  senderId: string;
  receiverId: string;
  body: string;
  createdAt: string;
};

export type SupportReadEvent = {
  readerId: string;
  otherUserId: string;
};

export interface SupportEventMap {
  "message.new": SupportMessageEvent;
  "messages.read": SupportReadEvent;
}

class SupportEventBus extends EventEmitter {
  emitSupport<K extends keyof SupportEventMap>(event: K, payload: SupportEventMap[K]): boolean {
    return this.emit(event, payload);
  }

  onSupport<K extends keyof SupportEventMap>(event: K, listener: (payload: SupportEventMap[K]) => void): this {
    return this.on(event, listener);
  }
}

/** Singleton event bus for support chat cross-module communication */
export const supportEvents = new SupportEventBus();

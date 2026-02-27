/**
 * GOBERNA -- Field Team Chat Event Bus
 *
 * In-process event emitter for chat WebSocket broadcasting.
 * Allows the WS handler to notify other connected clients about new messages.
 *
 * Usage:
 *   - Publisher:  chatEvents.emitChat("message.new", { ... })
 *   - Subscriber: chatEvents.onChat("message.new", (payload) => ...)
 */

import { EventEmitter } from "node:events";

export type ChatMessageEvent = {
  id: string;
  campaignId: string;
  senderId: string;
  receiverId: string;
  body: string;
  clientId: string | null;
  createdAt: string;
};

export type ChatReadEvent = {
  campaignId: string;
  readerId: string;
  otherUserId: string;
};

export interface ChatEventMap {
  "message.new": ChatMessageEvent;
  "messages.read": ChatReadEvent;
}

class ChatEventBus extends EventEmitter {
  emitChat<K extends keyof ChatEventMap>(event: K, payload: ChatEventMap[K]): boolean {
    return this.emit(event, payload);
  }

  onChat<K extends keyof ChatEventMap>(event: K, listener: (payload: ChatEventMap[K]) => void): this {
    return this.on(event, listener);
  }
}

/** Singleton event bus for field team chat */
export const chatEvents = new ChatEventBus();

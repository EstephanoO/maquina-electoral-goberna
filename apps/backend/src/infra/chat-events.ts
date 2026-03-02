/**
 * GOBERNA -- Field Team Chat Event Bus
 *
 * In-process event emitter for chat WebSocket broadcasting.
 * Supports both 1-to-1 direct messages and campaign channel (group) messages.
 *
 * Usage:
 *   - Publisher:  chatEvents.emitChat("message.new", { ... })
 *   - Subscriber: chatEvents.onChat("message.new", (payload) => ...)
 *   - Channel:    chatEvents.emitChat("channel.message.new", { ... })
 */

import { EventEmitter } from "node:events";

// ── 1-to-1 Direct Messages ──────────────────────────────────

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

// ── Channel (Group) Messages ─────────────────────────────────

export type ChannelMessageEvent = {
  id: string;
  campaignId: string;
  senderId: string;
  senderName: string;
  body: string;
  clientId: string | null;
  createdAt: string;
};

export type ChannelReadEvent = {
  campaignId: string;
  userId: string;
  lastReadAt: string;
};

// ── Event Map ────────────────────────────────────────────────

export interface ChatEventMap {
  "message.new": ChatMessageEvent;
  "messages.read": ChatReadEvent;
  "channel.message.new": ChannelMessageEvent;
  "channel.read": ChannelReadEvent;
}

class ChatEventBus extends EventEmitter {
  emitChat<K extends keyof ChatEventMap>(event: K, payload: ChatEventMap[K]): boolean {
    return this.emit(event, payload);
  }

  onChat<K extends keyof ChatEventMap>(event: K, listener: (payload: ChatEventMap[K]) => void): this {
    return this.on(event, listener);
  }
}

/** Singleton event bus for field team chat (direct + channel) */
export const chatEvents = new ChatEventBus();

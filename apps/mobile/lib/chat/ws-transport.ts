/**
 * Chat WebSocket transport.
 *
 * Connects to wss://api.goberna.us/ws/chat?token=<jwt>&campaignId=<id>
 * for real-time message delivery.
 *
 * Lifecycle:
 *   1. useChatGlobal calls connect() once at layout mount
 *   2. Individual screens subscribe via addListener() / removeListener()
 *   3. Auto-reconnect on drop (with fresh token each time)
 *   4. Only useChatGlobal calls disconnect() on unmount
 *
 * Listener model:
 *   connect() registers ONE owner handler. addListener() registers extra handlers.
 *   All handlers receive every server message. Filtering is the listener's job.
 */

import { API_BASE } from '../api';
import type { ChatServerMessage } from './types';

// ── Types ────────────────────────────────────────────────────

export type ChatWsState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

type MessageHandler = (msg: ChatServerMessage) => void;

// ── Constants ────────────────────────────────────────────────

const MIN_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const PING_INTERVAL_MS = 25_000;

// ── State (module singleton) ─────────────────────────────────

let ws: WebSocket | null = null;
let state: ChatWsState = 'disconnected';
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;

let currentCampaignId: string | null = null;
let tokenFetcher: (() => Promise<string | null>) | null = null;

/** Primary handler set by connect() — typically useChatGlobal */
let primaryHandler: MessageHandler | null = null;

/** Additional listeners — typically useChat for individual conversations */
const listeners = new Set<MessageHandler>();

// ── Broadcast ────────────────────────────────────────────────

function broadcast(msg: ChatServerMessage): void {
  primaryHandler?.(msg);
  for (const listener of listeners) {
    try {
      listener(msg);
    } catch {
      // Don't let one listener crash others
    }
  }
}

// ── URL builder ──────────────────────────────────────────────

function buildWsUrl(token: string, campaignId: string): string {
  const base = API_BASE.replace(/\/api\/?$/, '').replace(/^http/, 'ws');
  return `${base}/ws/chat?token=${encodeURIComponent(token)}&campaignId=${encodeURIComponent(campaignId)}`;
}

// ── Core ─────────────────────────────────────────────────────

/**
 * Connect to the chat WebSocket. Should be called ONCE by the global service.
 * If already connected, this is a no-op.
 */
export async function connect(
  campaignId: string,
  getToken: () => Promise<string | null>,
  handler: MessageHandler,
): Promise<void> {
  if (state === 'connected' || state === 'connecting') return;

  currentCampaignId = campaignId;
  tokenFetcher = getToken;
  primaryHandler = handler;

  await doConnect();
}

async function doConnect(): Promise<void> {
  if (!currentCampaignId || !tokenFetcher) return;

  state = reconnectAttempts > 0 ? 'reconnecting' : 'connecting';

  // Fetch fresh short-lived token
  let token: string | null;
  try {
    token = await tokenFetcher();
  } catch {
    console.warn('[ChatWS] Failed to fetch token');
    scheduleReconnect();
    return;
  }

  if (!token) {
    console.warn('[ChatWS] No token available');
    state = 'disconnected';
    return;
  }

  const url = buildWsUrl(token, currentCampaignId);

  try {
    ws = new WebSocket(url);
  } catch (err) {
    console.warn('[ChatWS] Failed to create WebSocket:', err);
    state = 'disconnected';
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    state = 'connected';
    reconnectAttempts = 0;
    startPingLoop();
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : '') as ChatServerMessage;
      broadcast(msg);
    } catch {
      console.warn('[ChatWS] Failed to parse server message');
    }
  };

  ws.onerror = (event: Event) => {
    console.warn('[ChatWS] Error:', (event as ErrorEvent).message ?? 'unknown');
  };

  ws.onclose = (event: CloseEvent) => {
    cleanup();

    // Intentional close (code 1000) — don't reconnect
    if (event.code === 1000) {
      state = 'disconnected';
      return;
    }

    // Auth failure — don't reconnect
    if (event.code === 4001 || event.code === 4002 || event.code === 4003) {
      console.warn('[ChatWS] Auth/permission failure, not reconnecting');
      state = 'disconnected';
      return;
    }

    scheduleReconnect();
  };
}

export function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  cleanup();
  if (ws) {
    try {
      ws.close(1000, 'client disconnect');
    } catch {
      // Ignore
    }
    ws = null;
  }
  state = 'disconnected';
  reconnectAttempts = 0;
  currentCampaignId = null;
  tokenFetcher = null;
  primaryHandler = null;
  listeners.clear();
}

function cleanup(): void {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function scheduleReconnect(): void {
  if (!currentCampaignId || !tokenFetcher) return;
  state = 'reconnecting';
  reconnectAttempts++;
  const delay = Math.min(
    MIN_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1),
    MAX_RECONNECT_DELAY_MS,
  );
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    doConnect();
  }, delay);
}

function startPingLoop(): void {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({ type: 'ping' }));
    } catch {
      // Will be caught by onerror/onclose
    }
  }, PING_INTERVAL_MS);
}

// ── Listener management ─────────────────────────────────────

/**
 * Add a message listener. Used by useChat for per-conversation updates.
 * Returns an unsubscribe function.
 */
export function addListener(handler: MessageHandler): () => void {
  listeners.add(handler);
  return () => { listeners.delete(handler); };
}

// ── Send ─────────────────────────────────────────────────────

/**
 * Send a message through the WebSocket. Returns false if not connected.
 */
export function sendMessage(receiverId: string, body: string, clientId?: string): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify({ type: 'send', receiverId, body, clientId }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Send a read receipt through the WebSocket.
 */
export function sendReadReceipt(otherUserId: string): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify({ type: 'read', otherUserId }));
    return true;
  } catch {
    return false;
  }
}

// ── Channel (Group) Send ─────────────────────────────────────

/**
 * Send a message to the campaign channel. Returns false if not connected.
 */
export function sendChannelMessage(body: string, clientId?: string): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify({ type: 'channel.send', body, clientId }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Send a channel read receipt through the WebSocket.
 */
export function sendChannelReadReceipt(): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify({ type: 'channel.read' }));
    return true;
  } catch {
    return false;
  }
}

// ── Getters ──────────────────────────────────────────────────

export function isConnected(): boolean {
  return state === 'connected';
}

export function getState(): ChatWsState {
  return state;
}

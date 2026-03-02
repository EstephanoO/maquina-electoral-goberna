/**
 * WebSocket transport for real-time location tracking.
 *
 * Connects to `wss://api.goberna.us/ws/tracking?token=<agent_ingest_token>`
 * and streams location data with server acknowledgment.
 *
 * Features:
 *   - Auto-reconnect with exponential backoff (1s → 30s)
 *   - Application-level ping/pong (server sends ping every 25s)
 *   - Graceful fallback: callers check `isConnected()` before sending
 *   - Queued locations are still stored in SQLite — WS is just a faster transport
 *   - Server can push config changes (interval, distance)
 *   - Metrics: messages sent, acks received, reconnect count
 *
 * Protocol (JSON over WS):
 *   Client→Server:
 *     { type: "location", data: LocationPayload }
 *     { type: "location.batch", data: LocationPayload[] }
 *     { type: "ping" }
 *   Server→Client:
 *     { type: "ack", seq: number, accepted: boolean, deduped: boolean }
 *     { type: "ack.batch", accepted: number, deduped: number, failed: number }
 *     { type: "config", interval_ms?: number, distance_m?: number }
 *     { type: "pong", server_ts: string }
 *     { type: "error", code: string, message: string }
 *
 * Note: React Native includes a global WebSocket implementation.
 * No additional dependencies needed.
 */

import { API_BASE } from '../api';
import { getAccessToken } from '../auth-store';

// ─── Types ────────────────────────────────────────────────────

export type WsTransportState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type LocationPayload = {
  agent_id: string;
  agent_name?: string;
  ts: string;
  lat: number;
  lng: number;
  seq: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  battery?: number;
  campaign_id?: string;
};

type ServerMessage =
  | { type: 'ack'; seq: number; accepted: boolean; deduped: boolean; server_ts: string }
  | { type: 'ack.batch'; accepted: number; deduped: number; failed: number; server_ts: string }
  | { type: 'config'; interval_ms?: number; distance_m?: number; server_ts: string }
  | { type: 'pong'; server_ts: string }
  | { type: 'error'; code: string; message: string };

type AckCallback = (accepted: boolean, deduped: boolean) => void;
type BatchAckCallback = (accepted: number, deduped: number, failed: number) => void;
type ConfigCallback = (config: { interval_ms?: number; distance_m?: number }) => void;

// ─── Constants ────────────────────────────────────────────────

const MIN_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const PING_INTERVAL_MS = 25_000;
const PING_TIMEOUT_MS = 10_000;

// ─── State ────────────────────────────────────────────────────

let ws: WebSocket | null = null;
let state: WsTransportState = 'disconnected';
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let pongTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
let lastPongAt = 0;

// Callbacks
let onConfigChange: ConfigCallback | null = null;

// Metrics
let messagesSent = 0;
let acksReceived = 0;
let reconnectCount = 0;

// Pending ack callbacks (keyed by seq for single locations)
const pendingAcks = new Map<number, AckCallback>();
let pendingBatchAck: BatchAckCallback | null = null;

// ─── URL Builder ──────────────────────────────────────────────

function buildWsUrl(token: string): string {
  // API_BASE is like "https://api.goberna.us/api"
  // We need "wss://api.goberna.us/ws/tracking?token=<jwt>"
  const base = API_BASE.replace(/\/api\/?$/, '').replace(/^http/, 'ws');
  return `${base}/ws/tracking?token=${encodeURIComponent(token)}`;
}

// ─── Core ─────────────────────────────────────────────────────

export function connect(opts?: { onConfig?: ConfigCallback }): void {
  if (state === 'connected' || state === 'connecting') return;
  if (opts?.onConfig) onConfigChange = opts.onConfig;

  state = reconnectAttempts > 0 ? 'reconnecting' : 'connecting';

  // Get JWT from SecureStore (async) then open WebSocket
  getAccessToken()
    .then((token) => {
      if (!token) {
        console.warn('[WS] No JWT available, cannot connect');
        state = 'disconnected';
        scheduleReconnect();
        return;
      }
      openSocket(token);
    })
    .catch((err) => {
      console.warn('[WS] Failed to get JWT:', err);
      state = 'disconnected';
      scheduleReconnect();
    });
}

function openSocket(token: string): void {
  // State may have changed while we were awaiting the token
  if (state === 'disconnected') return;

  const url = buildWsUrl(token);

  try {
    ws = new WebSocket(url);
  } catch (err) {
    console.warn('[WS] Failed to create WebSocket:', err);
    state = 'disconnected';
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    state = 'connected';
    reconnectAttempts = 0;
    lastPongAt = Date.now();
    console.log('[WS] Connected to tracking server');
    startPingLoop();
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : '') as ServerMessage;
      handleServerMessage(msg);
    } catch {
      console.warn('[WS] Failed to parse server message');
    }
  };

  ws.onerror = (event: Event) => {
    console.warn('[WS] Error:', (event as ErrorEvent).message ?? 'unknown');
  };

  ws.onclose = (event: CloseEvent) => {
    console.log(`[WS] Closed: code=${event.code} reason=${event.reason}`);
    cleanup();

    // Don't reconnect if closed by us intentionally (code 1000)
    if (event.code === 1000) {
      state = 'disconnected';
      return;
    }

    // Auth failure — don't reconnect
    if (event.code === 4001) {
      console.warn('[WS] Auth failed, not reconnecting');
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
  pendingAcks.clear();
  pendingBatchAck = null;
}

function cleanup(): void {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (pongTimeoutTimer) {
    clearTimeout(pongTimeoutTimer);
    pongTimeoutTimer = null;
  }
}

function scheduleReconnect(): void {
  state = 'reconnecting';
  reconnectAttempts++;
  reconnectCount++;
  const delay = Math.min(
    MIN_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1),
    MAX_RECONNECT_DELAY_MS,
  );
  console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

// ─── Ping/Pong ────────────────────────────────────────────────

function startPingLoop(): void {
  if (pingTimer) clearInterval(pingTimer);

  pingTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    try {
      ws.send(JSON.stringify({ type: 'ping' }));
    } catch {
      // Will be caught by onerror/onclose
    }

    // Set pong timeout
    if (pongTimeoutTimer) clearTimeout(pongTimeoutTimer);
    pongTimeoutTimer = setTimeout(() => {
      if (Date.now() - lastPongAt > PING_INTERVAL_MS + PING_TIMEOUT_MS) {
        console.warn('[WS] Pong timeout, reconnecting');
        ws?.close(4000, 'pong timeout');
      }
    }, PING_TIMEOUT_MS);
  }, PING_INTERVAL_MS);
}

// ─── Message Handling ─────────────────────────────────────────

function handleServerMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case 'ack': {
      acksReceived++;
      const cb = pendingAcks.get(msg.seq);
      if (cb) {
        pendingAcks.delete(msg.seq);
        cb(msg.accepted, msg.deduped);
      }
      break;
    }
    case 'ack.batch': {
      acksReceived++;
      if (pendingBatchAck) {
        const cb = pendingBatchAck;
        pendingBatchAck = null;
        cb(msg.accepted, msg.deduped, msg.failed);
      }
      break;
    }
    case 'config': {
      console.log('[WS] Config update:', msg);
      if (onConfigChange) {
        onConfigChange({ interval_ms: msg.interval_ms, distance_m: msg.distance_m });
      }
      break;
    }
    case 'pong': {
      lastPongAt = Date.now();
      if (pongTimeoutTimer) {
        clearTimeout(pongTimeoutTimer);
        pongTimeoutTimer = null;
      }
      break;
    }
    case 'error': {
      console.warn(`[WS] Server error: ${msg.code} - ${msg.message}`);
      break;
    }
  }
}

// ─── Send Methods ─────────────────────────────────────────────

/**
 * Send a single location update via WebSocket.
 * Returns true if the message was sent (not necessarily acknowledged).
 */
export function sendLocation(payload: LocationPayload, onAck?: AckCallback): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;

  try {
    ws.send(JSON.stringify({ type: 'location', data: payload }));
    messagesSent++;
    if (onAck) {
      pendingAcks.set(payload.seq, onAck);
      // Auto-cleanup after 30s to prevent memory leak
      setTimeout(() => pendingAcks.delete(payload.seq), 30_000);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Send a batch of locations via WebSocket.
 * Returns true if the message was sent.
 */
export function sendLocationBatch(
  locations: LocationPayload[],
  onAck?: BatchAckCallback,
): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  if (locations.length === 0) return true;

  try {
    ws.send(JSON.stringify({ type: 'location.batch', data: locations }));
    messagesSent++;
    if (onAck) {
      pendingBatchAck = onAck;
      // Auto-cleanup after 30s
      setTimeout(() => {
        if (pendingBatchAck === onAck) pendingBatchAck = null;
      }, 30_000);
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Status Getters ───────────────────────────────────────────

export function isConnected(): boolean {
  return state === 'connected' && ws !== null && ws.readyState === WebSocket.OPEN;
}

export function getState(): WsTransportState {
  return state;
}

export function getMetrics(): {
  state: WsTransportState;
  messagesSent: number;
  acksReceived: number;
  reconnectCount: number;
  pendingAcks: number;
} {
  return {
    state,
    messagesSent,
    acksReceived,
    reconnectCount,
    pendingAcks: pendingAcks.size,
  };
}

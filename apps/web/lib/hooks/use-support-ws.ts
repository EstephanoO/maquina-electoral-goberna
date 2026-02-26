/**
 * GOBERNA — WebSocket hook for real-time support chat.
 *
 * Connects to wss://api.goberna.us/ws/support/chat (or localhost in dev).
 * Only connects when `enabled` is true (panel open).
 *
 * Best practices:
 *   - Callbacks stored in refs to avoid effect re-runs
 *   - Stable return references via useCallback with empty deps
 *   - Clean teardown on disable/unmount
 *   - Exponential backoff reconnection (max 30s)
 */

import { useEffect, useRef, useCallback, useState } from "react";

// ─── Types (exported for consumers) ──────────────────────────

export type SupportWsMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  body: string;
  createdAt: string;
};

type SupportWsEvent =
  | { type: "message.new"; message: SupportWsMessage }
  | { type: "messages.read"; readerId: string; otherUserId: string }
  | { type: "connected"; userId: string; ts: string }
  | { type: "error"; code: string; message: string };

type UseSupportWsOptions = {
  enabled: boolean;
  onMessage: (msg: SupportWsMessage) => void;
  onRead?: (readerId: string, otherUserId: string) => void;
};

// ─── Constants ───────────────────────────────────────────────

const PING_INTERVAL_MS = 20_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_000;

// ─── WS URL resolver (hoisted, no deps) ─────────────────────

function getWsUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname === "localhost"
    ? "ws://localhost:3001/ws/support/chat"
    : "wss://api.goberna.us/ws/support/chat";
}

// ─── Hook ────────────────────────────────────────────────────

export function useSupportWs({ enabled, onMessage, onRead }: UseSupportWsOptions) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Store callbacks in refs so the WS effect never re-runs due to callback identity changes
  const onMessageRef = useRef(onMessage);
  const onReadRef = useRef(onRead);
  useEffect(() => { onMessageRef.current = onMessage; });
  useEffect(() => { onReadRef.current = onRead; });

  // Stable send — never changes identity, safe to pass as prop
  const send = useCallback((receiverId: string, body: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "send", receiverId, body }));
    }
  }, []);

  // Stable markRead — never changes identity
  const markRead = useCallback((otherUserId: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "read", otherUserId }));
    }
  }, []);

  // Connection effect — only depends on `enabled`
  useEffect(() => {
    if (!enabled) {
      // Ensure clean state when disabled
      if (wsRef.current) {
        wsRef.current.close(1000, "disabled");
        wsRef.current = null;
      }
      setConnected(false);
      return;
    }

    let reconnectTimer: ReturnType<typeof setTimeout>;
    let pingTimer: ReturnType<typeof setInterval>;
    let attempt = 0;
    let disposed = false;

    function connect() {
      if (disposed) return;
      const url = getWsUrl();
      if (!url) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) { ws.close(); return; }
        setConnected(true);
        attempt = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as SupportWsEvent;
          if (data.type === "message.new") {
            onMessageRef.current(data.message);
          } else if (data.type === "messages.read") {
            onReadRef.current?.(data.readerId, data.otherUserId);
          }
        } catch {
          // Ignore malformed
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!disposed) {
          const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
          attempt++;
          reconnectTimer = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        // onclose fires after — reconnect handled there
      };
    }

    connect();

    pingTimer = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, PING_INTERVAL_MS);

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      if (wsRef.current) {
        wsRef.current.close(1000, "cleanup");
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [enabled]);

  return { connected, send, markRead } as const;
}

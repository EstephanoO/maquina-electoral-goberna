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
import { getWsToken } from "@/lib/services/support";

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

function getWsBaseUrl(): string {
  if (typeof window === "undefined") return "";
  if (window.location.hostname === "localhost") {
    return "ws://localhost:3001/ws/support/chat";
  }
  // Same-origin WSS: nginx en electoral.goberna.club proxa a backend (puerto 3000)
  // Mantener mismo host que el frontend evita errores de mixed content y CORS.
  return `wss://${window.location.host}/ws/support/chat`;
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

    async function connect() {
      if (disposed) return;
      const baseUrl = getWsBaseUrl();
      if (!baseUrl) return;

      // Fetch a short-lived JWT via the Next.js proxy (same-origin, cookies travel).
      // The token is then passed as ?token= to the cross-origin WS URL.
      let token: string;
      try {
        const res = await getWsToken();
        if (!res.ok || !res.data?.token) {
          throw new Error("No token returned");
        }
        token = res.data.token;
      } catch {
        // Token fetch failed — schedule reconnect with backoff
        if (!disposed) {
          const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
          attempt++;
          reconnectTimer = setTimeout(connect, delay);
        }
        return;
      }

      if (disposed) return;

      const url = `${baseUrl}?token=${encodeURIComponent(token)}`;
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

/**
 * GOBERNA — WebSocket hook for real-time support chat.
 *
 * Connects to wss://api.goberna.us/ws/support/chat (or localhost in dev),
 * handles sending messages, receiving new messages, and read receipts.
 *
 * Auth: sends the access token cookie automatically via the WS handshake.
 */

import { useEffect, useRef, useCallback, useState } from "react";

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

function getWsUrl(): string {
  if (typeof window === "undefined") return "";
  if (window.location.hostname === "localhost") {
    return "ws://localhost:3001/ws/support/chat";
  }
  return "wss://api.goberna.us/ws/support/chat";
}

export function useSupportWs({ enabled, onMessage, onRead }: UseSupportWsOptions) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  const send = useCallback((receiverId: string, body: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "send", receiverId, body }));
  }, []);

  const markRead = useCallback((otherUserId: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "read", otherUserId }));
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let attempt = 0;
    let disposed = false;

    function connect() {
      if (disposed) return;
      const url = getWsUrl();
      if (!url) return;

      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
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
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!disposed) {
          const delay = Math.min(1000 * 2 ** attempt, 30_000);
          attempt++;
          reconnectTimer = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        // onclose will fire — reconnect handled there
      };
    }

    connect();

    // Keep-alive ping every 20s
    const pingTimer = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 20_000);

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

  return { connected, send, markRead };
}

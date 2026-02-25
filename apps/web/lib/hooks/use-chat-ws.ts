/**
 * GOBERNA — WebSocket hook for real-time WhatsApp chat messages.
 *
 * Connects to wss://api.goberna.us/ws/cms/chat (or localhost in dev),
 * subscribes to the selected contact, and calls onMessageEvent when
 * a new message or status update arrives.
 *
 * Auth: sends the access token cookie automatically via the WS handshake
 * when same-origin, or falls back to ?token= query param.
 */

import { useEffect, useRef, useCallback, useState } from "react";

type ChatWsEvent =
  | { type: "message.new"; contactId: string; direction: string; messageId: string }
  | { type: "message.status"; contactId: string; twilioSid: string; status: string };

type UseChatWsOptions = {
  campaignId: string | null;
  contactId: string | null;
  onMessageEvent: (event: ChatWsEvent) => void;
};

/** Resolve the WS backend URL. In dev, use localhost. In prod, use api.goberna.us. */
function getWsUrl(campaignId: string): string {
  if (typeof window === "undefined") return "";

  // In development (localhost), connect to local backend
  if (window.location.hostname === "localhost") {
    return `ws://localhost:3001/ws/cms/chat?campaignId=${campaignId}`;
  }

  // In production / Vercel preview, connect directly to backend API
  return `wss://api.goberna.us/ws/cms/chat?campaignId=${campaignId}`;
}

export function useChatWs({ campaignId, contactId, onMessageEvent }: UseChatWsOptions) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageEventRef = useRef(onMessageEvent);
  onMessageEventRef.current = onMessageEvent;

  const contactIdRef = useRef(contactId);
  contactIdRef.current = contactId;

  // Subscribe to a contact — sends the subscribe message over the open WS
  const subscribe = useCallback((cId: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "subscribe", contactId: cId }));
  }, []);

  // Main WS connection effect
  useEffect(() => {
    if (!campaignId) return;
    const cid = campaignId; // narrow for closure

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let attempt = 0;
    let disposed = false;

    function connect() {
      if (disposed) return;

      const url = getWsUrl(cid);
      if (!url) return;

      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        attempt = 0;

        // Subscribe to current contact if one is selected
        const currentContact = contactIdRef.current;
        if (currentContact) {
          ws.send(JSON.stringify({ type: "subscribe", contactId: currentContact }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);

          if (data.type === "message.new" || data.type === "message.status") {
            onMessageEventRef.current(data as ChatWsEvent);
          }
          // connected, subscribed, pong, error — no action needed
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
        // onclose will fire after this — reconnect handled there
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
  }, [campaignId]);

  // When selected contact changes, re-subscribe
  useEffect(() => {
    if (contactId) {
      subscribe(contactId);
    }
  }, [contactId, subscribe]);

  return { connected };
}

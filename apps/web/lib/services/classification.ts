/**
 * GOBERNA — Classification Events Service
 *
 * Fetches classification events from the backend for the extension monitor dashboard.
 * Uses raw fetch (like getExtensionMonitor) because this is a public page that
 * authenticates via campaign_id only, not user session.
 */

// ── Types ─────────────────────────────────────────────────────────────

export type ClassificationSource = "auto" | "manual" | "correction";

export type ClassificationEvent = {
  id: string;
  campaign_id: string;
  operator_id: string;
  operator_name: string | null;
  validation_id: string | null;
  phone: string | null;
  contact_name: string | null;
  message_text: string;
  source: ClassificationSource;
  category: string;
  vote_class: string;
  status: string;
  confidence: number;
  reason: string;
  corrected_vote_class: string | null;
  corrected_status: string | null;
  corrected_by: string | null;
  corrected_by_name: string | null;
  corrected_at: string | null;
  original_event_id: string | null;
  created_at: string;
  nombre: string | null;
};

export type ClassificationStats = {
  total: number;
  by_source: Record<string, number>;
  by_category: Record<string, number>;
  by_vote_class: Record<string, number>;
  by_status: Record<string, number>;
  corrections_count: number;
  accuracy_rate: number;
  avg_confidence: number;
  last_hour: number;
  last_24h: number;
};

// ── Helpers ───────────────────────────────────────────────────────────

async function classificationFetch<T>(
  path: string,
  campaignId: string,
  options: RequestInit = {},
): Promise<T & { ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api${path}`, {
      ...options,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "x-campaign-id": campaignId,
        ...(options.headers || {}),
      },
    });
    const json = await res.json();
    return json;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return { ok: false, error: message } as T & { ok: boolean; error: string };
  }
}

// ── API Functions ─────────────────────────────────────────────────────

export async function getClassificationEvents(
  campaignId: string,
  params?: {
    page?: number;
    limit?: number;
    source?: string;
    category?: string;
    vote_class?: string;
  },
): Promise<{
  ok: boolean;
  items?: ClassificationEvent[];
  total?: number;
  page?: number;
  limit?: number;
  error?: string;
}> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.source) query.set("source", params.source);
  if (params?.category) query.set("category", params.category);
  if (params?.vote_class) query.set("vote_class", params.vote_class);

  const qs = query.toString();
  return classificationFetch(`/validacion/classification-events${qs ? `?${qs}` : ""}`, campaignId);
}

export async function getClassificationStats(
  campaignId: string,
): Promise<{ ok: boolean; stats?: ClassificationStats; error?: string }> {
  return classificationFetch("/validacion/classification-stats", campaignId);
}

export async function correctClassification(
  campaignId: string,
  eventId: string,
  correctedVoteClass: string,
  correctedStatus: string,
): Promise<{ ok: boolean; event?: ClassificationEvent; error?: string }> {
  return classificationFetch(`/validacion/classification-events/${eventId}/correct`, campaignId, {
    method: "PUT",
    body: JSON.stringify({
      corrected_vote_class: correctedVoteClass,
      corrected_status: correctedStatus,
    }),
  });
}

// ── SSE Stream ───────────────────────────────────────────────────────

export type ClassificationSseEvent =
  | { type: "classification.new"; event: ClassificationEvent }
  | { type: "classification.corrected"; event: ClassificationEvent }
  | { type: "connected"; ts: number; clients: number }
  | { type: "heartbeat"; ts: number };

/**
 * Connect to the classification events SSE stream.
 * Returns a cleanup function to close the connection.
 *
 * Uses EventSource-like fetch approach with manual parsing
 * (same-origin credentials required for auth cookie).
 */
export function connectClassificationStream(
  campaignId: string,
  onEvent: (ev: ClassificationSseEvent) => void,
  onError?: (err: Error) => void,
): () => void {
  let aborted = false;
  let attempt = 0;
  let ctrl = new AbortController();
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  async function tryRefreshToken(): Promise<boolean> {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function connect() {
    if (aborted) return;
    ctrl = new AbortController();

    try {
      const res = await fetch("/api/validacion/classification-events/stream", {
        credentials: "same-origin",
        headers: {
          "x-campaign-id": campaignId,
          Accept: "text/event-stream",
        },
        signal: ctrl.signal,
      });

      // Handle 401: try refresh once
      if (res.status === 401) {
        const refreshed = await tryRefreshToken();
        if (refreshed && !aborted) {
          attempt = 0;
          return connect();
        }
        throw new Error("Authentication failed");
      }

      if (!res.ok) {
        throw new Error(`SSE stream responded ${res.status}`);
      }

      // Reset attempt counter on successful connection
      attempt = 0;

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No readable body");

      const decoder = new TextDecoder();
      let buf = "";
      let currentEvent = "";
      let currentData = "";

      while (!aborted) {
        const { value, done } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            currentData = line.slice(6);
          } else if (line === "" && currentEvent && currentData) {
            try {
              const parsed = JSON.parse(currentData);
              if (currentEvent === "classification.new") {
                onEvent({ type: "classification.new", event: parsed });
              } else if (currentEvent === "classification.corrected") {
                onEvent({ type: "classification.corrected", event: parsed });
              } else if (currentEvent === "connected") {
                onEvent({ type: "connected", ts: parsed.ts, clients: parsed.clients });
              } else if (currentEvent === "heartbeat") {
                onEvent({ type: "heartbeat", ts: parsed.ts });
              }
            } catch { /* malformed JSON, skip */ }
            currentEvent = "";
            currentData = "";
          }
        }
      }
    } catch (err: unknown) {
      if (aborted) return;
      const error = err instanceof Error ? err : new Error(String(err));
      if (error.name === "AbortError") return;
      onError?.(error);
    }

    // Exponential backoff reconnection (max 30s)
    if (!aborted) {
      const delay = Math.min(1000 * 2 ** attempt, 30_000);
      attempt++;
      reconnectTimer = setTimeout(connect, delay);
    }
  }

  connect();

  return () => {
    aborted = true;
    ctrl.abort();
    if (reconnectTimer) clearTimeout(reconnectTimer);
  };
}

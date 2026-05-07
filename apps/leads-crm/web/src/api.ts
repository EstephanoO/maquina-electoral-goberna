import type { Course, Interaction, Lead, Operator, Send, Stats, Template } from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const TOKEN_KEY = "auth_token";

function getToken(): string | null { return localStorage.getItem(TOKEN_KEY); }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as any ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    // token expired or invalid — drop and reload
    localStorage.removeItem(TOKEN_KEY);
    window.location.reload();
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text ? (JSON.parse(text).error || text) : `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Generic verbs (usados por features que no tienen helper dedicado, ej. /ai/*)
  get: <T = unknown>(path: string) => request<T>(path),
  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }),

  listLeads: (params: Record<string, string | number | boolean | undefined> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== false).map(([k, v]) => [k, String(v)])
    );
    return request<Lead[]>(`/leads${qs.toString() ? `?${qs}` : ""}`);
  },
  leadsCount: (params: { q?: string; stage?: string; buyer_tier?: string; country?: string; year?: string } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])
    );
    return request<{ total: number; revenue: number; vips: number; repeats: number; buyers: number; noname: number; byCountry: Record<string, number> }>(`/leads/count${qs.toString() ? `?${qs}` : ""}`);
  },
  getLead: (id: number) => request<Lead>(`/leads/${id}`),
  createLead: (body: Partial<Lead>) => request<Lead>("/leads", { method: "POST", body: JSON.stringify(body) }),
  updateLead: (id: number, body: Partial<Lead>) => request<Lead>(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteLead: (id: number) => request<void>(`/leads/${id}`, { method: "DELETE" }),
  bulkUpdate: (ids: number[], patch: Partial<Lead>) =>
    request<{ updated: number; leads: Lead[] }>("/leads/bulk", { method: "POST", body: JSON.stringify({ ids, patch }) }),

  listInteractions: (leadId: number) => request<Interaction[]>(`/leads/${leadId}/interactions`),
  addInteraction: (leadId: number, body: { kind: string; body?: string; by?: string; meta?: unknown }) =>
    request<Interaction>(`/leads/${leadId}/interactions`, { method: "POST", body: JSON.stringify(body) }),

  listTemplates: () => request<Template[]>("/templates"),
  createTemplate: (body: { name: string; body: string }) =>
    request<Template>("/templates", { method: "POST", body: JSON.stringify(body) }),
  updateTemplate: (id: number, body: Partial<Template>) =>
    request<Template>(`/templates/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTemplate: (id: number) => request<void>(`/templates/${id}`, { method: "DELETE" }),
  previewTemplate: (body: string, sample?: Record<string, unknown>) =>
    request<string[][]>("/templates/preview", { method: "POST", body: JSON.stringify({ body, sample }) }),
  uploadTemplateImage: async (file: File): Promise<string> => {
    const token = localStorage.getItem("auth_token");
    const fd = new FormData();
    fd.append("image", file);
    const res = await fetch(`${BASE}/templates/upload`, {
      method: "POST",
      body: fd,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error((await res.text()) || `${res.status}`);
    const data = await res.json();
    return `${BASE}${data.url}`;
  },

  listSends: (params: { status?: string; assigned_to?: string; available_now?: boolean } = {}) => {
    const entries: [string, string][] = [];
    if (params.status) entries.push(["status", params.status]);
    if (params.assigned_to) entries.push(["assigned_to", params.assigned_to]);
    if (params.available_now) entries.push(["available_now", "1"]);
    const qs = new URLSearchParams(entries);
    return request<Send[]>(`/sends${qs.toString() ? `?${qs}` : ""}`);
  },
  createSends: (body: {
    lead_ids: number[]; body: string;
    assigned_to?: string | null; image_url?: string | null;
    scheduled_at?: string | null;
  }) => request<Send[]>("/sends", { method: "POST", body: JSON.stringify(body) }),
  cancelSend: (id: number) => request<void>(`/sends/${id}`, { method: "DELETE" }),

  listOperators: () => request<Operator[]>("/users"),
  getActiveSessions: () => request<Record<string, { last_seen: string; user_name?: string; user_email?: string }>>("settings/active_sessions"),

  stats: () => request<Stats>("/stats"),
  dailyReport: (params: { date?: string; period?: string } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])
    );
    return request<any>(`/reports/daily${qs.toString() ? `?${qs}` : ""}`);
  },
  // Chat
  listChats: (params: { q?: string; assigned_to?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])
    );
    return request<any[]>(`/chats${qs.toString() ? `?${qs}` : ""}`);
  },
  getChatDetail: (leadId: number) => request<any>(`/chats/${leadId}/detail`),
  getChatMessages: (leadId: number, params: { before?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])
    );
    return request<any[]>(`/chats/${leadId}/messages${qs.toString() ? `?${qs}` : ""}`);
  },
  sendChatMessage: (leadId: number, message: string, via?: string) =>
    request<any>(`/chats/${leadId}/send`, { method: "POST", body: JSON.stringify({ message, via }) }),
  // Marca el chat como leído. Bumpea leads.last_read_at = now() para que el
  // unread_count del /chats baje sin necesidad de que el operador conteste.
  markChatRead: (leadId: number) =>
    request<{ ok: boolean; last_read_at: string }>(`/chats/${leadId}/read`, { method: "POST" }),
  getBotStatus: () => request<any[]>("/bot/status").catch(() => []),
  getBotQR: (id: string) => request<{ status: string; qr: string | null }>(`/bot/qr/${id}`).catch(() => ({ status: "unreachable", qr: null })),
  restartBot: (id: string) => request<any>(`/bot/restart/${id}`, { method: "POST" }),
  logoutBot: (id: string) => request<any>(`/bot/logout/${id}`, { method: "POST" }),
  getBotLogs: (id: string) => request<{ id: string; logs: string[] }>(`/bot/logs/${id}`).catch(() => ({ id, logs: [] })),

  listCourses: (refresh = false) => request<Course[]>(`/courses${refresh ? "?refresh=1" : ""}`),

  getSetting: <T = unknown>(key: string) => request<T>(`/settings/${key}`),

  // AI Reply
  aiGetSuggestion: (leadId: number) =>
    request<{ ok: boolean; suggestion: any }>(`/ai/suggest/${leadId}`),
  aiGenerateSuggestion: (leadId: number, message: string) =>
    request<{ ok: boolean; suggestion: any }>(`/ai/generate`, { method: "POST", body: JSON.stringify({ leadId, message }) }),
  aiSendSuggestion: (suggestionId: number) =>
    request<{ ok: boolean }>(`/ai/suggest/${suggestionId}/send`, { method: "POST" }),
  aiIgnoreSuggestion: (suggestionId: number) =>
    request<{ ok: boolean }>(`/ai/suggest/${suggestionId}/ignore`, { method: "POST" }),
  aiAddFeedback: (opts: { suggestionId: number; rating: string; editedBody?: string; note?: string }) =>
    request<{ ok: boolean }>(`/ai/feedback`, { method: "POST", body: JSON.stringify(opts) }),
  aiStats: () =>
    request<{ ok: boolean; stats: any }>(`/ai/stats`),
  aiSuccessful: () =>
    request<{ ok: boolean; replies: any[] }>(`/ai/successful`),

  setSetting: (key: string, value: unknown) =>
    request<{ ok: true }>(`/settings/${key}`, { method: "PUT", body: JSON.stringify(value) }),
};

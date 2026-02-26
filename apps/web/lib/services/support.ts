/**
 * GOBERNA — Support Chat Service
 * API client for internal support chat endpoints.
 */

import { apiRequest } from "./api";

export type SupportMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  read: boolean;
  created_at: string;
};

export type ConversationSummary = {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  foto_url: string | null;
  last_message: string;
  last_message_at: string;
  unread_count: number;
};

/** Get conversation messages with a specific user */
export async function getMessages(otherUserId: string, limit = 50, before?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  return apiRequest<{ messages: SupportMessage[] }>(
    `/api/support/messages/${otherUserId}?${params}`,
  );
}

/** Get unread message count */
export async function getUnreadCount() {
  return apiRequest<{ count: number }>("/api/support/unread");
}

/** Mark messages from a user as read */
export async function markRead(otherUserId: string) {
  return apiRequest<{ updated: number }>(`/api/support/read/${otherUserId}`, {
    method: "POST",
  });
}

/** Admin: list all conversation threads */
export async function listConversations() {
  return apiRequest<{ conversations: ConversationSummary[] }>(
    "/api/support/conversations",
  );
}

/** Get admin user IDs (for candidato to know who to message) */
export async function getAdminIds() {
  return apiRequest<{ adminIds: string[] }>("/api/support/admins");
}

/** Get a short-lived JWT for WebSocket authentication.
 *  Called via Next.js proxy (same-origin) where httpOnly cookies travel,
 *  then the token is passed as ?token= to the cross-origin WS URL. */
export async function getWsToken() {
  return apiRequest<{ token: string }>("/api/support/ws-token");
}

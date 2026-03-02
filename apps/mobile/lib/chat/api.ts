/**
 * Chat REST API client.
 *
 * Endpoints for conversations, message history, unread counts, team members,
 * and the short-lived WS token.
 */

import { getAccessToken, getActiveCampaignId } from '../auth-store';
import { API_BASE } from '../api';
import type { ChatMessage, ChannelMessage, ConversationSummary, TeamMember } from './types';

const TIMEOUT_MS = 15_000;

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

async function chatRequest<T>(path: string, method = 'GET'): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const token = await getAccessToken();
    const campaignId = await getActiveCampaignId();

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (campaignId) headers['x-campaign-id'] = campaignId;

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Error' }));
      return { ok: false, error: body.message ?? `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error de red';
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Endpoints ────────────────────────────────────────────────

export async function getConversations(): Promise<ApiResponse<{ conversations: ConversationSummary[] }>> {
  return chatRequest('/chat/conversations');
}

export async function getMessages(
  otherUserId: string,
  limit = 50,
  before?: string,
): Promise<ApiResponse<{ messages: ChatMessage[] }>> {
  let path = `/chat/messages/${otherUserId}?limit=${limit}`;
  if (before) path += `&before=${encodeURIComponent(before)}`;
  return chatRequest(path);
}

export async function getUnreadCount(): Promise<ApiResponse<{ count: number }>> {
  return chatRequest('/chat/unread');
}

export async function markRead(otherUserId: string): Promise<ApiResponse<{ updated: number }>> {
  return chatRequest(`/chat/read/${otherUserId}`, 'POST');
}

export async function getTeamMembers(): Promise<ApiResponse<{ members: TeamMember[] }>> {
  return chatRequest('/chat/team');
}

/**
 * Fetch a short-lived JWT for WebSocket auth.
 * Returns the raw token string, or null on failure.
 */
export async function getWsToken(): Promise<string | null> {
  const result = await chatRequest<{ token: string }>('/chat/ws-token');
  if (result.ok) return result.data.token;
  console.warn('[ChatAPI] Failed to get WS token:', result.error);
  return null;
}

// ── Channel (Group) Endpoints ────────────────────────────────

export async function getChannelMessages(
  limit = 50,
  before?: string,
): Promise<ApiResponse<{ messages: ChannelMessage[] }>> {
  let path = `/chat/channel/messages?limit=${limit}`;
  if (before) path += `&before=${encodeURIComponent(before)}`;
  return chatRequest(path);
}

export async function getChannelUnreadCount(): Promise<ApiResponse<{ count: number }>> {
  return chatRequest('/chat/channel/unread');
}

export async function markChannelRead(): Promise<ApiResponse<{ last_read_at: string }>> {
  return chatRequest('/chat/channel/read', 'POST');
}

export async function getChannelInfo(): Promise<ApiResponse<{ member_count: number }>> {
  return chatRequest('/chat/channel/info');
}

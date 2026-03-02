/**
 * useChat — Hook for an individual 1-to-1 conversation screen.
 *
 * Manages:
 * - Message list (local + remote)
 * - Sending messages (offline-first via queue)
 * - Read receipts
 * - Auto-sync pending messages
 *
 * Does NOT manage WS connection lifecycle — that's useChatGlobal's job.
 * Instead, subscribes to messages via chatWs.addListener().
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAgent, useActiveCampaign } from '@/lib/app-context';
import type { ChatMessage, ChatServerMessage } from '@/lib/chat/types';
import * as chatApi from '@/lib/chat/api';
import * as chatWs from '@/lib/chat/ws-transport';
import * as chatQueue from '@/lib/chat/offline-queue';

type UseChatReturn = {
  messages: ChatMessage[];
  loading: boolean;
  sending: boolean;
  connected: boolean;
  error: string | null;
  sendMessage: (body: string) => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  markAsRead: () => void;
};

export function useChat(otherUserId: string): UseChatReturn {
  const agent = useAgent();
  const campaign = useActiveCampaign();
  const campaignId = campaign.id;
  const userId = agent.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const mountedRef = useRef(true);
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track connected state from WS
  const [connected, setConnected] = useState(chatWs.isConnected());

  // ── Load initial messages ─────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    const load = async () => {
      const result = await chatApi.getMessages(otherUserId);
      if (!mountedRef.current) return;

      if (result.ok) {
        setMessages(result.data.messages);
        setHasMore(result.data.messages.length >= 50);
      } else {
        setError(result.error);
      }
      setLoading(false);
    };

    load();
    return () => { mountedRef.current = false; };
  }, [otherUserId]);

  // ── Subscribe to WS messages (global WS is already connected) ─
  useEffect(() => {
    const handleMessage = (msg: ChatServerMessage) => {
      if (msg.type === 'connected') {
        setConnected(true);
      }

      if (msg.type === 'message.new') {
        const m = msg.message;
        // Only add if it's part of this conversation
        if (
          (m.sender_id === userId && m.receiver_id === otherUserId) ||
          (m.sender_id === otherUserId && m.receiver_id === userId)
        ) {
          setMessages((prev) => {
            // Dedup by id or client_id
            if (prev.some((p) => p.id === m.id || (m.client_id && p.client_id === m.client_id))) {
              return prev;
            }
            return [...prev, m];
          });
        }
      }

      if (msg.type === 'message.deduped') {
        // Server confirmed a retried message already existed — mark as synced
        chatQueue.markAsSynced([msg.clientId]).catch(() => {});
      }

      if (msg.type === 'messages.read' && msg.readerId === otherUserId) {
        // Other user read our messages — mark all as read in local state
        setMessages((prev) =>
          prev.map((m) =>
            m.sender_id === userId && !m.read ? { ...m, read: true } : m,
          ),
        );
      }

      if (msg.type === 'error') {
        console.warn('[Chat] WS error:', msg.code, msg.message);
      }
    };

    // Subscribe — returns unsubscribe function
    const unsubscribe = chatWs.addListener(handleMessage);

    // Sync connected state
    setConnected(chatWs.isConnected());

    return unsubscribe;
  }, [userId, otherUserId]);

  // ── Periodic sync for pending messages ────────────────────
  useEffect(() => {
    const syncPending = async () => {
      const pending = await chatQueue.getPendingMessages(10);
      if (pending.length === 0) return;

      // Filter to messages for this conversation
      const relevant = pending.filter(
        (p) => p.campaign_id === campaignId && p.receiver_id === otherUserId,
      );

      for (const msg of relevant) {
        const sent = chatWs.sendMessage(otherUserId, msg.body, msg.client_id);
        if (sent) {
          await chatQueue.markAsSynced([msg.client_id]);
        }
      }
    };

    syncTimerRef.current = setInterval(syncPending, 5_000);
    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [campaignId, otherUserId]);

  // ── Send message ──────────────────────────────────────────
  const sendMessage = useCallback(async (body: string) => {
    if (!body.trim()) return;
    setSending(true);

    try {
      // 1. Queue locally (offline-first)
      const { clientId } = await chatQueue.queueChatMessage(campaignId, otherUserId, body.trim());

      // 2. Optimistic UI — add to messages immediately
      const optimistic: ChatMessage = {
        id: clientId, // temporary, will be replaced by server id
        campaign_id: campaignId,
        sender_id: userId,
        receiver_id: otherUserId,
        body: body.trim(),
        client_id: clientId,
        read: false,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      // 3. Try to send via WS immediately
      const sent = chatWs.sendMessage(otherUserId, body.trim(), clientId);
      if (sent) {
        await chatQueue.markAsSynced([clientId]);
      }
      // If WS send failed, the periodic sync will retry
    } catch (err) {
      console.warn('[Chat] Failed to queue message:', err);
    } finally {
      setSending(false);
    }
  }, [campaignId, otherUserId, userId]);

  // ── Load more (pagination) ────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!hasMore || loading || messages.length === 0) return;

    const oldest = messages[0];
    if (!oldest) return;

    const result = await chatApi.getMessages(otherUserId, 50, oldest.created_at);
    if (result.ok) {
      const older = result.data.messages;
      setHasMore(older.length >= 50);
      setMessages((prev) => [...older, ...prev]);
    }
  }, [hasMore, loading, messages, otherUserId]);

  // ── Mark as read ──────────────────────────────────────────
  const markAsRead = useCallback(() => {
    chatWs.sendReadReceipt(otherUserId);
    chatApi.markRead(otherUserId).catch(() => {});
  }, [otherUserId]);

  return {
    messages,
    loading,
    sending,
    connected,
    error,
    sendMessage,
    loadMore,
    hasMore,
    markAsRead,
  };
}

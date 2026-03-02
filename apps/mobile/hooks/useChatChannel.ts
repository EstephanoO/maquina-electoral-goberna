/**
 * useChatChannel — Hook for the campaign channel (group chat) screen.
 *
 * Manages:
 * - Channel message list (local + remote)
 * - Sending messages (offline-first via queue)
 * - Read cursor updates
 * - Auto-sync pending messages
 *
 * Similar pattern to useChat but for the campaign-wide channel.
 * Does NOT manage WS connection lifecycle — that's useChatGlobal's job.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAgent, useActiveCampaign } from '@/lib/app-context';
import type { ChannelMessage, ChatServerMessage } from '@/lib/chat/types';
import * as chatApi from '@/lib/chat/api';
import * as chatWs from '@/lib/chat/ws-transport';
import * as chatQueue from '@/lib/chat/offline-queue';

type UseChatChannelReturn = {
  messages: ChannelMessage[];
  loading: boolean;
  sending: boolean;
  connected: boolean;
  error: string | null;
  memberCount: number;
  sendMessage: (body: string) => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  markAsRead: () => void;
};

export function useChatChannel(): UseChatChannelReturn {
  const agent = useAgent();
  const campaign = useActiveCampaign();
  const campaignId = campaign.id;
  const userId = agent.id;

  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [memberCount, setMemberCount] = useState(0);
  const [connected, setConnected] = useState(chatWs.isConnected());

  const mountedRef = useRef(true);
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load initial messages + channel info ──────────────────
  useEffect(() => {
    mountedRef.current = true;

    const load = async () => {
      const [msgResult, infoResult] = await Promise.all([
        chatApi.getChannelMessages(),
        chatApi.getChannelInfo(),
      ]);

      if (!mountedRef.current) return;

      if (msgResult.ok) {
        setMessages(msgResult.data.messages);
        setHasMore(msgResult.data.messages.length >= 50);
      } else {
        setError(msgResult.error);
      }

      if (infoResult.ok) {
        setMemberCount(infoResult.data.member_count);
      }

      setLoading(false);
    };

    load();
    return () => { mountedRef.current = false; };
  }, []);

  // ── Subscribe to WS messages ──────────────────────────────
  useEffect(() => {
    const handleMessage = (msg: ChatServerMessage) => {
      if (msg.type === 'connected') {
        setConnected(true);
      }

      if (msg.type === 'channel.message.new') {
        const m = msg.message;
        setMessages((prev) => {
          // Dedup by id or client_id
          if (prev.some((p) => p.id === m.id || (m.client_id && p.client_id === m.client_id))) {
            return prev;
          }
          return [...prev, m];
        });
      }

      if (msg.type === 'channel.message.deduped') {
        chatQueue.markAsSynced([msg.clientId]).catch(() => {});
      }

      if (msg.type === 'error') {
        console.warn('[ChatChannel] WS error:', msg.code, msg.message);
      }
    };

    const unsubscribe = chatWs.addListener(handleMessage);
    setConnected(chatWs.isConnected());

    return unsubscribe;
  }, []);

  // ── Periodic sync for pending channel messages ────────────
  useEffect(() => {
    const syncPending = async () => {
      const pending = await chatQueue.getPendingMessages(10);
      if (pending.length === 0) return;

      // Filter to channel messages (receiver_id === 'channel')
      const relevant = pending.filter(
        (p) => p.campaign_id === campaignId && p.receiver_id === 'channel',
      );

      for (const msg of relevant) {
        const sent = chatWs.sendChannelMessage(msg.body, msg.client_id);
        if (sent) {
          await chatQueue.markAsSynced([msg.client_id]);
        }
      }
    };

    syncTimerRef.current = setInterval(syncPending, 5_000);
    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [campaignId]);

  // ── Send message ──────────────────────────────────────────
  const sendMessage = useCallback(async (body: string) => {
    if (!body.trim()) return;
    setSending(true);

    try {
      // 1. Queue locally — use 'channel' as receiver_id to distinguish from DMs
      const { clientId } = await chatQueue.queueChatMessage(campaignId, 'channel', body.trim());

      // 2. Optimistic UI
      const optimistic: ChannelMessage = {
        id: clientId,
        campaign_id: campaignId,
        sender_id: userId,
        sender_name: agent.full_name,
        body: body.trim(),
        client_id: clientId,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      // 3. Try WS send immediately
      const sent = chatWs.sendChannelMessage(body.trim(), clientId);
      if (sent) {
        await chatQueue.markAsSynced([clientId]);
      }
    } catch (err) {
      console.warn('[ChatChannel] Failed to queue message:', err);
    } finally {
      setSending(false);
    }
  }, [campaignId, userId, agent.full_name]);

  // ── Load more (pagination) ────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!hasMore || loading || messages.length === 0) return;

    const oldest = messages[0];
    if (!oldest) return;

    const result = await chatApi.getChannelMessages(50, oldest.created_at);
    if (result.ok) {
      const older = result.data.messages;
      setHasMore(older.length >= 50);
      setMessages((prev) => [...older, ...prev]);
    }
  }, [hasMore, loading, messages]);

  // ── Mark as read ──────────────────────────────────────────
  const markAsRead = useCallback(() => {
    chatWs.sendChannelReadReceipt();
    chatApi.markChannelRead().catch(() => {});
  }, []);

  return {
    messages,
    loading,
    sending,
    connected,
    error,
    memberCount,
    sendMessage,
    loadMore,
    hasMore,
    markAsRead,
  };
}

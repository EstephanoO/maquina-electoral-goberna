/**
 * useChatGlobal — Global chat service mounted at layout level.
 *
 * Responsibilities:
 *   1. Maintain WS connection for the entire (main) lifecycle
 *   2. Track total unread count (for tab badge)
 *   3. Fire local notifications when a message arrives and the user
 *      is NOT viewing the conversation with that sender
 *   4. Expose state that _layout.tsx can use for the badge
 *
 * This hook does NOT manage individual conversation messages —
 * that's useChat's job. This is only for notifications + badge.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'expo-router';

import { useAgent, useActiveCampaign } from '@/lib/app-context';
import type { ChatServerMessage } from '@/lib/chat/types';
import * as chatApi from '@/lib/chat/api';
import * as chatWs from '@/lib/chat/ws-transport';

// Lazy-load expo-notifications to avoid crash in Expo Go (SDK 53+).
// Remote notification support was removed from Expo Go; local notifications
// still work in dev builds. We degrade gracefully when unavailable.
let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
  Notifications!.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  console.warn('[ChatGlobal] expo-notifications not available (Expo Go?). Local notifications disabled.');
}

export type ChatGlobalState = {
  unreadCount: number;
  channelUnreadCount: number;
  connected: boolean;
};

export function useChatGlobal(enabled: boolean): ChatGlobalState {
  const agent = useAgent();
  const campaign = useActiveCampaign();
  const campaignId = campaign.id;
  const userId = agent.id;
  const pathname = usePathname();

  const [unreadCount, setUnreadCount] = useState(0);
  const [channelUnreadCount, setChannelUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);

  // Track current path to decide whether to show notification
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // ── Fetch initial unread counts (DM + channel) ───────────
  useEffect(() => {
    if (!enabled) return;
    chatApi.getUnreadCount().then((result) => {
      if (result.ok) setUnreadCount(result.data.count);
    });
    chatApi.getChannelUnreadCount().then((result) => {
      if (result.ok) setChannelUnreadCount(result.data.count);
    });
  }, [enabled]);

  // ── WS connection at layout level ────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const handleMessage = (msg: ChatServerMessage) => {
      if (msg.type === 'connected') {
        setConnected(true);
      }

      if (msg.type === 'message.new') {
        const m = msg.message;

        // Only count messages sent TO us (not our own)
        if (m.receiver_id === userId) {
          // Check if user is currently viewing the conversation with this sender
          const onConversationScreen =
            pathnameRef.current.includes('chat-conversation');

          if (!onConversationScreen) {
            // Increment unread badge
            setUnreadCount((prev) => prev + 1);

            // Fire local notification
            showLocalNotification(m.sender_id, m.body);
          }
        }
      }

      if (msg.type === 'messages.read') {
        // We read messages — refresh unread count
        chatApi.getUnreadCount().then((result) => {
          if (result.ok) setUnreadCount(result.data.count);
        });
      }

      // ── Channel messages ───────────────────────
      if (msg.type === 'channel.message.new') {
        const m = msg.message;
        // Only count if NOT our own message and NOT on channel screen
        if (m.sender_id !== userId) {
          const onChannelScreen = pathnameRef.current.includes('channel');
          if (!onChannelScreen) {
            setChannelUnreadCount((prev) => prev + 1);
            showLocalNotification(
              m.sender_id,
              m.body,
              m.sender_name ? `${m.sender_name} (Canal)` : 'Canal del Equipo',
            );
          }
        }
      }

      if (msg.type === 'channel.read') {
        // Refresh channel unread
        chatApi.getChannelUnreadCount().then((result) => {
          if (result.ok) setChannelUnreadCount(result.data.count);
        });
      }
    };

    chatWs.connect(campaignId, chatApi.getWsToken, handleMessage);

    return () => {
      chatWs.disconnect();
      setConnected(false);
    };
  }, [enabled, campaignId, userId]);

  return { unreadCount, channelUnreadCount, connected };
}

// ── Local Notification Helper ────────────────────────────────

// Cache sender names to avoid repeated lookups
const senderNameCache = new Map<string, string>();

async function showLocalNotification(senderId: string, body: string, titleOverride?: string): Promise<void> {
  let title = titleOverride;

  if (!title) {
    let senderName = senderNameCache.get(senderId);
    if (!senderName) {
      const result = await chatApi.getTeamMembers();
      if (result.ok) {
        for (const member of result.data.members) {
          senderNameCache.set(member.user_id, member.full_name);
        }
        senderName = senderNameCache.get(senderId);
      }
    }
    title = senderName ?? 'Nuevo mensaje';
  }

  if (!Notifications) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: body.length > 100 ? body.slice(0, 100) + '...' : body,
        data: { type: 'chat', senderId },
        sound: true,
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('[ChatGlobal] Failed to schedule notification:', err);
  }
}



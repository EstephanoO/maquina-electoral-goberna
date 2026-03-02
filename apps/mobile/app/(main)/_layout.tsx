/**
 * Main Layout — Tabs with dynamic colors from AppConfig.
 * 
 * Tab visibility:
 * - Dashboard: Always visible
 * - Reuniones (Metas): Always visible
 * - Chat: Only for brigadista_zonal and agente_campo (field roles)
 * - Solicitudes: Only for candidato and above
 * - new-form: Hidden (accessed via FAB)
 * - chat-conversation: Hidden (accessed via chat list)
 * - channel: Hidden (accessed via chat list — campaign group chat)
 *
 * Global chat service:
 *   For field roles, the useChatGlobal hook maintains a WS connection
 *   for the entire (main) lifecycle, tracks unread count, and fires
 *   local notifications for incoming messages.
 */

import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '@/lib/app-context';
import { useChatGlobal } from '@/hooks/useChatGlobal';

/** Badge dot for the chat tab icon */
function ChatTabIcon({ color, unreadCount }: { color: string; unreadCount: number }) {
  return (
    <View style={styles.iconContainer}>
      <MaterialIcons name="chat" size={28} color={color} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Wrapper that mounts useChatGlobal only for field roles */
function ChatTabLayout({
  showChat,
  primary,
  secondary,
  showSolicitudes,
}: {
  showChat: boolean;
  primary: string;
  secondary: string;
  showSolicitudes: boolean;
}) {
  // Global chat WS — always called (hook rules), but no-op when !showChat
  const chat = useChatGlobal(showChat);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: secondary,
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.6)',
        tabBarStyle: {
          backgroundColor: primary,
          borderTopWidth: 0,
          height: 70,
          paddingBottom: 10,
          paddingTop: 10,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="table-chart" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reuniones"
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="groups" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          href: showChat ? undefined : null,
          tabBarIcon: ({ color }) => (
            <ChatTabIcon color={color} unreadCount={chat.unreadCount + chat.channelUnreadCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="solicitudes"
        options={{
          href: showSolicitudes ? undefined : null,
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="assignment-ind" size={28} color={color} />
          ),
        }}
      />
      {/* Hidden screens — accessed via router.push, not tabs */}
      <Tabs.Screen
        name="new-form"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="chat-conversation"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="channel"
        options={{ href: null }}
      />
    </Tabs>
  );
}

export default function MainLayout() {
  const { auth } = useApp();

  // During logout the router hasn't navigated away yet — render nothing
  if (auth.status !== 'active') return null;

  const { candidate, agent } = auth.config;

  const primary = candidate.color_primario;
  const secondary = candidate.color_secundario;

  const showSolicitudes = ['admin', 'consultor', 'candidato'].includes(agent.role);
  const showChat = ['brigadista_zonal', 'agente_campo'].includes(agent.role);

  return (
    <ChatTabLayout
      showChat={showChat}
      primary={primary}
      secondary={secondary}
      showSolicitudes={showSolicitudes}
    />
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#FF3B30',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
});

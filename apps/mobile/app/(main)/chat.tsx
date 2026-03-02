/**
 * Chat — Conversations list.
 *
 * Shows existing conversations and team members the user can chat with.
 * Tapping a conversation opens the chat screen.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { useCandidate, useAgent, useActiveCampaign } from '@/lib/app-context';
import type { ConversationSummary, TeamMember } from '@/lib/chat/types';
import * as chatApi from '@/lib/chat/api';

// Channel unread count will be fetched separately for the channel card

const ROLE_LABELS: Record<string, string> = {
  brigadista_zonal: 'Brigadista',
  agente_campo: 'Agente',
  admin: 'Admin',
};

export default function ChatScreen() {
  const router = useRouter();
  const candidate = useCandidate();
  const agent = useAgent();
  const campaign = useActiveCampaign();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [channelUnread, setChannelUnread] = useState(0);
  const [channelMemberCount, setChannelMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const primary = candidate.color_primario;

  const loadData = useCallback(async () => {
    const [convResult, teamResult, channelUnreadResult, channelInfoResult] = await Promise.all([
      chatApi.getConversations(),
      chatApi.getTeamMembers(),
      chatApi.getChannelUnreadCount(),
      chatApi.getChannelInfo(),
    ]);

    if (convResult.ok) setConversations(convResult.data.conversations);
    if (teamResult.ok) setTeamMembers(teamResult.data.members);
    if (channelUnreadResult.ok) setChannelUnread(channelUnreadResult.data.count);
    if (channelInfoResult.ok) setChannelMemberCount(channelInfoResult.data.member_count);
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const openChat = useCallback(
    (otherUserId: string, otherName: string) => {
      router.push({
        pathname: '/(main)/chat-conversation',
        params: { otherUserId, otherName },
      });
    },
    [router],
  );

  const openChannel = useCallback(() => {
    router.push('/(main)/channel');
  }, [router]);

  // Combine: conversations first, then team members without conversations
  const conversationUserIds = new Set(conversations.map((c) => c.user_id));
  const newContacts = teamMembers.filter((m) => !conversationUserIds.has(m.user_id));

  const renderConversation = ({ item }: { item: ConversationSummary }) => (
    <Pressable
      style={styles.conversationRow}
      onPress={() => openChat(item.user_id, item.full_name)}
    >
      <View style={[styles.avatar, { backgroundColor: primary }]}>
        <Text style={styles.avatarText}>
          {item.full_name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.conversationInfo}>
        <View style={styles.conversationHeader}>
          <Text style={styles.nameText} numberOfLines={1}>
            {item.full_name}
          </Text>
          <Text style={styles.roleTag}>
            {ROLE_LABELS[item.role] ?? item.role}
          </Text>
        </View>
        <Text style={styles.lastMessage} numberOfLines={1}>
          {item.is_me_sender ? 'Tu: ' : ''}{item.last_message}
        </Text>
      </View>
      {item.unread_count > 0 && (
        <View style={[styles.badge, { backgroundColor: primary }]}>
          <Text style={styles.badgeText}>{item.unread_count}</Text>
        </View>
      )}
    </Pressable>
  );

  const renderTeamMember = ({ item }: { item: TeamMember }) => (
    <Pressable
      style={styles.conversationRow}
      onPress={() => openChat(item.user_id, item.full_name)}
    >
      <View style={[styles.avatar, { backgroundColor: '#666' }]}>
        <Text style={styles.avatarText}>
          {item.full_name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.conversationInfo}>
        <View style={styles.conversationHeader}>
          <Text style={styles.nameText} numberOfLines={1}>
            {item.full_name}
          </Text>
          <Text style={styles.roleTag}>
            {ROLE_LABELS[item.role] ?? item.role}
          </Text>
        </View>
        <Text style={[styles.lastMessage, { color: '#999' }]}>
          Iniciar conversacion
        </Text>
      </View>
      <MaterialIcons name="chat-bubble-outline" size={20} color="#999" />
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={[styles.header, { backgroundColor: primary }]}>
        <MaterialIcons name="chat" size={24} color="white" />
        <Text style={styles.headerTitle}>Chat del Equipo</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      ) : (
        <FlatList
          data={[...conversations]}
          keyExtractor={(item) => item.user_id}
          renderItem={renderConversation}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />
          }
          ListHeaderComponent={
            <Pressable style={styles.channelCard} onPress={openChannel}>
              <View style={[styles.channelAvatar, { backgroundColor: primary }]}>
                <MaterialIcons name="groups" size={24} color="white" />
              </View>
              <View style={styles.conversationInfo}>
                <Text style={styles.nameText}>Canal del Equipo</Text>
                <Text style={styles.lastMessage}>
                  {channelMemberCount} miembros
                </Text>
              </View>
              {channelUnread > 0 && (
                <View style={[styles.badge, { backgroundColor: primary }]}>
                  <Text style={styles.badgeText}>
                    {channelUnread > 99 ? '99+' : channelUnread}
                  </Text>
                </View>
              )}
              <MaterialIcons name="chevron-right" size={24} color="#ccc" />
            </Pressable>
          }
          ListFooterComponent={
            newContacts.length > 0 ? (
              <View>
                <Text style={styles.sectionTitle}>Equipo</Text>
                {newContacts.map((member) => (
                  <View key={member.user_id}>
                    {renderTeamMember({ item: member })}
                  </View>
                ))}
              </View>
            ) : null
          }
          ListEmptyComponent={
            newContacts.length === 0 ? (
              <View style={styles.center}>
                <MaterialIcons name="chat-bubble-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No hay conversaciones</Text>
              </View>
            ) : null
          }
          contentContainerStyle={conversations.length === 0 && newContacts.length === 0 ? styles.emptyContainer : undefined}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  conversationInfo: {
    flex: 1,
    marginLeft: 12,
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
    flexShrink: 1,
  },
  roleTag: {
    fontSize: 11,
    color: '#888',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  lastMessage: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 14,
    color: '#999',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  channelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fafafa',
  },
  channelAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

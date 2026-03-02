/**
 * Channel — Campaign group chat screen.
 *
 * All brigadista_zonal + agente_campo in the campaign share this single channel.
 * Messages show sender name + role. Offline-first sending via the same queue system.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { useCandidate, useAgent } from '@/lib/app-context';
import { useChatChannel } from '@/hooks/useChatChannel';
import type { ChannelMessage } from '@/lib/chat/types';

const ROLE_LABELS: Record<string, string> = {
  brigadista_zonal: 'Brigadista',
  agente_campo: 'Agente',
  admin: 'Admin',
};

export default function ChannelScreen() {
  const router = useRouter();
  const candidate = useCandidate();
  const agent = useAgent();
  const primary = candidate.color_primario;
  const userId = agent.id;

  const {
    messages,
    loading,
    sending,
    connected,
    memberCount,
    sendMessage,
    loadMore,
    hasMore,
    markAsRead,
  } = useChatChannel();

  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList<ChannelMessage>>(null);

  // Mark as read when screen opens and on new messages
  useEffect(() => {
    if (messages.length > 0) {
      markAsRead();
    }
  }, [messages.length, markAsRead]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    await sendMessage(text);
  }, [inputText, sendMessage]);

  const renderMessage = useCallback(
    ({ item }: { item: ChannelMessage }) => {
      const isMe = item.sender_id === userId;
      return (
        <View style={styles.messageContainer}>
          {/* Show sender name for other people's messages */}
          {!isMe && (
            <View style={styles.senderRow}>
              <Text style={[styles.senderName, { color: primary }]}>
                {item.sender_name}
              </Text>
              {item.sender_role && (
                <Text style={styles.senderRole}>
                  {ROLE_LABELS[item.sender_role] ?? item.sender_role}
                </Text>
              )}
            </View>
          )}
          <View
            style={[
              styles.bubble,
              isMe
                ? [styles.bubbleMe, { backgroundColor: primary }]
                : styles.bubbleThem,
            ]}
          >
            <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
              {item.body}
            </Text>
            <Text style={[styles.timeText, isMe && styles.timeTextMe]}>
              {formatTime(item.created_at)}
            </Text>
          </View>
        </View>
      );
    },
    [userId, primary],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: primary }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={24} color="white" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>Canal del Equipo</Text>
          <Text style={styles.headerStatus}>
            {connected ? `${memberCount} miembros` : 'Conectando...'}
          </Text>
        </View>
        <MaterialIcons name="groups" size={28} color="rgba(255,255,255,0.8)" />
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.center}>
            <Text style={styles.loadingText}>Cargando mensajes...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onEndReached={() => {
              if (hasMore) loadMore();
            }}
            onEndReachedThreshold={0.3}
            inverted={false}
            onContentSizeChange={() => {
              flatListRef.current?.scrollToEnd({ animated: false });
            }}
            ListEmptyComponent={
              <View style={styles.center}>
                <MaterialIcons name="groups" size={48} color="#ddd" />
                <Text style={styles.emptyText}>
                  Canal del equipo. Todos los agentes y brigadistas pueden ver los mensajes.
                </Text>
              </View>
            }
          />
        )}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Mensaje al equipo..."
            placeholderTextColor="#999"
            multiline
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <Pressable
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            style={[
              styles.sendButton,
              { backgroundColor: inputText.trim() ? primary : '#ccc' },
            ]}
          >
            <MaterialIcons name="send" size={20} color="white" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  headerInfo: { flex: 1 },
  headerName: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  headerStatus: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  messageContainer: {
    marginVertical: 2,
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 14,
    marginBottom: 2,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '700',
  },
  senderRole: {
    fontSize: 10,
    color: '#888',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  messagesList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexGrow: 1,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: 'white',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    color: '#222',
    lineHeight: 20,
  },
  bubbleTextMe: {
    color: 'white',
  },
  timeText: {
    fontSize: 11,
    color: '#999',
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  timeTextMe: {
    color: 'rgba(255,255,255,0.7)',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: 'white',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
  input: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: '#222',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 14,
    color: '#999',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
});

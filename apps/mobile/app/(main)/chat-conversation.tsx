/**
 * Chat Conversation — 1-to-1 chat with a team member.
 *
 * Shows message history, real-time updates via WS, and offline-first sending.
 */

import { useCallback, useEffect, useRef } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';

import { useCandidate, useAgent } from '@/lib/app-context';
import { useChat } from '@/hooks/useChat';
import type { ChatMessage } from '@/lib/chat/types';

export default function ChatConversationScreen() {
  const router = useRouter();
  const { otherUserId, otherName } = useLocalSearchParams<{
    otherUserId: string;
    otherName: string;
  }>();

  const candidate = useCandidate();
  const agent = useAgent();
  const primary = candidate.color_primario;
  const userId = agent.id;

  const {
    messages,
    loading,
    sending,
    connected,
    sendMessage,
    loadMore,
    hasMore,
    markAsRead,
  } = useChat(otherUserId);

  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // Mark as read when screen opens and when new messages arrive
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
    ({ item }: { item: ChatMessage }) => {
      const isMe = item.sender_id === userId;
      return (
        <View
          style={[
            styles.bubble,
            isMe ? [styles.bubbleMe, { backgroundColor: primary }] : styles.bubbleThem,
          ]}
        >
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
            {item.body}
          </Text>
          <View style={styles.bubbleMeta}>
            <Text style={[styles.timeText, isMe && styles.timeTextMe]}>
              {formatTime(item.created_at)}
            </Text>
            {isMe && (
              <MaterialIcons
                name={item.read ? 'done-all' : 'done'}
                size={14}
                color={isMe ? 'rgba(255,255,255,0.7)' : '#999'}
                style={{ marginLeft: 4 }}
              />
            )}
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
          <Text style={styles.headerName} numberOfLines={1}>
            {otherName}
          </Text>
          <Text style={styles.headerStatus}>
            {connected ? 'En linea' : 'Conectando...'}
          </Text>
        </View>
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
                <MaterialIcons name="chat-bubble-outline" size={48} color="#ddd" />
                <Text style={styles.emptyText}>Envia el primer mensaje</Text>
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
            placeholder="Escribe un mensaje..."
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
    marginVertical: 2,
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
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  timeText: {
    fontSize: 11,
    color: '#999',
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
});

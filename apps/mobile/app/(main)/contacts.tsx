/**
 * Contacts — Lista principal de contactos del cuaderno de campo.
 *
 * Reemplaza a dashboard.tsx como pantalla central post-login.
 * Permite buscar por nombre/teléfono y filtrar por estado electoral.
 */

import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContactRow } from '@/components/contacts/ContactRow';
import EstadoChips from '@/components/contacts/EstadoChips';
import { Brand, FontFamily, Neutral } from '@/constants/theme';
import { useCandidate } from '@/lib/app-context';
import {
  listContacts,
  searchContacts,
  type Contact,
  type ContactEstado,
} from '@/lib/offline-queue/contacts';

export default function ContactsScreen() {
  const router = useRouter();
  const candidate = useCandidate();
  const primary = candidate.color_primario;

  const [query, setQuery] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<ContactEstado | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadContacts = useCallback(async (q: string, estado: ContactEstado | null) => {
    try {
      setLoading(true);
      const result =
        q.trim().length > 0
          ? await searchContacts(q)
          : await listContacts(estado ? { estado } : undefined);
      setContacts(result);
    } catch (err) {
      console.warn('ContactsScreen: failed to load contacts', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload on screen focus (e.g. returning from add/detail screens)
  useFocusEffect(
    useCallback(() => {
      void loadContacts(query, estadoFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadContacts]),
  );

  // Reload on estadoFilter change immediately
  useEffect(() => {
    void loadContacts(query, estadoFilter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoFilter]);

  // Debounced reload on query change (~300ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void loadContacts(query, estadoFilter);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const renderItem = useCallback(
    ({ item }: { item: Contact }) => (
      <ContactRow
        contact={item}
        onPress={() => router.push(`/(main)/contact/${item.id}` as never)}
      />
    ),
    [router],
  );

  const renderEmpty = useCallback(() => {
    if (loading) {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator color={primary} size="large" />
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>📋</Text>
        <Text style={[styles.emptyTitle, { color: primary }]}>Sin contactos</Text>
        <Text style={styles.emptySubtitle}>Tocá + para registrar tu primer contacto</Text>
      </View>
    );
  }, [loading, primary]);

  const renderHeader = useCallback(
    () => (
      <View style={styles.header}>
        <Text style={[styles.screenTitle, { color: primary }]}>Contactos</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre o teléfono"
          placeholderTextColor={Neutral.textMuted}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        <EstadoChips value={estadoFilter} onChange={setEstadoFilter} />
      </View>
    ),
    [primary, query, estadoFilter],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB — Agregar contacto */}
      <Pressable
        testID="fab-add-contact"
        style={[styles.fab, { backgroundColor: primary }]}
        onPress={() => router.push('/(main)/add-contact' as never)}
        accessibilityLabel="Agregar contacto"
        accessibilityRole="button"
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Neutral.bg,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  screenTitle: {
    fontSize: 22,
    fontFamily: FontFamily.bold,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  searchInput: {
    marginHorizontal: 16,
    marginBottom: 4,
    height: 44,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: FontFamily.regular,
    color: '#1e293b',
    borderWidth: 1,
    borderColor: Neutral.borderSoft,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 100,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: FontFamily.bold,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Neutral.textMuted,
    fontFamily: FontFamily.regular,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 5,
  },
  fabIcon: {
    fontSize: 32,
    color: '#ffffff',
    fontFamily: FontFamily.bold,
    marginTop: -2,
  },
});

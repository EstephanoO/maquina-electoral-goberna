/**
 * Solicitudes Screen — Admin only.
 * Shows pending access requests with approve/reject buttons.
 * Data from GET /api/access-requests/pending (admin endpoint).
 */

import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { useCandidate } from '@/lib/app-context';
import * as api from '@/lib/api';
import type { AccessRequestRow } from '@/lib/types';

const FONT = 'Montserrat-Bold';
const BORDER = '#E1E6F0';
const TEXT_MUTED = 'rgba(22, 57, 96, 0.7)';

export default function SolicitudesScreen() {
  const candidate = useCandidate();
  const primary = candidate.color_primario;

  const [requests, setRequests] = useState<AccessRequestRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRequests = useCallback(async () => {
    setError(null);
    const result = await api.getPendingAccessRequests();
    if (result.ok) {
      setRequests(result.data.pending_requests);
    } else {
      setError(result.error ?? 'Error al cargar solicitudes');
    }
    setLoading(false);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  }, [loadRequests]);

  useFocusEffect(
    useCallback(() => {
      void loadRequests();
    }, [loadRequests]),
  );

  const handleAction = async (id: string, status: 'approved' | 'rejected', name: string) => {
    const label = status === 'approved' ? 'aprobar' : 'rechazar';

    Alert.alert(
      `¿${status === 'approved' ? 'Aprobar' : 'Rechazar'} solicitud?`,
      `¿Deseas ${label} el acceso de ${name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: status === 'approved' ? 'Aprobar' : 'Rechazar',
          style: status === 'rejected' ? 'destructive' : 'default',
          onPress: async () => {
            const result = await api.resolveAccessRequest(id, { status });
            if (result.ok) {
              setRequests((prev) => prev.filter((r) => r.id !== id));
            } else {
              Alert.alert('Error', result.error);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.header, { backgroundColor: primary }]}>
        <Text style={styles.headerTitle}>Solicitudes de acceso</Text>
        <Text style={styles.headerCount}>
          {requests.length} pendiente{requests.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{item.full_name}</Text>
              <Text style={styles.cardEmail}>{item.email}</Text>
              <Text style={styles.cardDate}>
                {new Date(item.created_at).toLocaleDateString('es-PE', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <View style={styles.cardActions}>
              <Pressable
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={() => handleAction(item.id, 'approved', item.full_name)}
              >
                <Text style={styles.approveText}>✓</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => handleAction(item.id, 'rejected', item.full_name)}
              >
                <Text style={styles.rejectText}>✕</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {loading ? (
              <Text style={styles.emptyText}>Cargando...</Text>
            ) : error ? (
              <>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable style={[styles.retryBtn, { backgroundColor: primary }]} onPress={loadRequests}>
                  <Text style={styles.retryText}>Reintentar</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.emptyText}>No hay solicitudes pendientes</Text>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { padding: 20, gap: 4 },
  headerTitle: { fontSize: 20, color: '#FFFFFF', fontFamily: FONT },
  headerCount: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: FONT },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 10,
    alignItems: 'center',
  },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontSize: 15, color: '#163960', fontFamily: FONT },
  cardEmail: { fontSize: 13, color: TEXT_MUTED, fontFamily: FONT },
  cardDate: { fontSize: 11, color: 'rgba(22, 57, 96, 0.4)', fontFamily: FONT, marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtn: { backgroundColor: '#DCFCE7' },
  rejectBtn: { backgroundColor: '#FEE2E2' },
  approveText: { fontSize: 18, color: '#16A34A' },
  rejectText: { fontSize: 18, color: '#DC2626' },
  emptyState: { padding: 32, alignItems: 'center', gap: 16 },
  emptyText: { fontSize: 16, color: '#163960', fontFamily: FONT },
  errorText: { fontSize: 14, color: '#DC2626', fontFamily: FONT, textAlign: 'center' },
  retryBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  retryText: { fontSize: 13, color: '#FFFFFF', fontFamily: FONT },
});

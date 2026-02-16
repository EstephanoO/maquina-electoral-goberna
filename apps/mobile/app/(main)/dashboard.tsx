/**
 * Dashboard — 100% data-driven desde AppConfig.
 *
 * Nada es hardcodeado:
 * - Nombre candidato → config.candidate.name
 * - Colores → config.candidate.color_primario/color_secundario
 * - Imagen → config.candidate.logo_url / foto_url
 * - Agent info → config.agent.full_name
 *
 * Note: Form submissions are queued via write-behind and don't have a list endpoint yet.
 * This screen shows candidate info and placeholder for records.
 */

import { Image } from 'expo-image';
import { memo, useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useCandidate, useAgent, useApp } from '@/lib/app-context';
import { useAgentTracking } from '@/hooks/useAgentTracking';

const FONT = 'Montserrat-Bold';
const BORDER = '#E1E6F0';

// Placeholder for records - would need backend endpoint to list submissions
type PlaceholderRecord = {
  id: string;
  message: string;
};

const PlaceholderItem = memo(function PlaceholderItem({
  item,
  color,
}: {
  item: PlaceholderRecord;
  color: string;
}) {
  return (
    <View style={[styles.tableRow, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      <View style={styles.rowContent}>
        <Text style={styles.rowField}>{item.message}</Text>
      </View>
    </View>
  );
});

// ─── Screen ─────────────────────────────────────────────────

export default function DashboardScreen() {
  const router = useRouter();
  const candidate = useCandidate();
  const agent = useAgent();
  const { refreshConfig } = useApp();

  // Auto-start GPS tracking when dashboard mounts
  const { trackingState } = useAgentTracking();

  const primary = candidate.color_primario;
  const secondary = candidate.color_secundario;
  const textOnPrimary = '#FFFFFF';

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshConfig();
    setRefreshing(false);
  }, [refreshConfig]);

  // Placeholder data - would come from API when available
  const placeholderRecords: PlaceholderRecord[] = [];

  const renderItem = useCallback(
    ({ item }: { item: PlaceholderRecord }) => <PlaceholderItem item={item} color={primary} />,
    [primary],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Hero header — colors from config */}
      <View style={[styles.header, { backgroundColor: primary }]}>
        <View style={styles.heroCard}>
          {candidate.logo_url ? (
            <Image source={{ uri: candidate.logo_url }} style={styles.candidateImage} contentFit="contain" />
          ) : candidate.foto_url ? (
            <Image source={{ uri: candidate.foto_url }} style={styles.candidateImage} contentFit="cover" />
          ) : (
            <View style={[styles.candidateImagePlaceholder, { backgroundColor: secondary }]}>
              <Text style={[styles.placeholderText, { color: primary }]}>
                {candidate.name.charAt(0)}
              </Text>
            </View>
          )}
          <View style={styles.headerTextBlock}>
            <Text style={[styles.headerOverline, { color: 'rgba(255,255,255,0.6)' }]}>
              Candidato
            </Text>
            <Text style={[styles.headerName, { color: textOnPrimary }]}>
              {candidate.name}
            </Text>
            <Text style={[styles.headerRole, { color: 'rgba(255,255,255,0.8)' }]}>
              {candidate.cargo}
            </Text>
            <View style={[styles.badge, { borderColor: secondary, backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <Text style={[styles.badgeText, { color: secondary }]}>
                {candidate.partido} · {candidate.numero}
              </Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
            <Text style={[styles.statLabel, { color: 'rgba(255,255,255,0.7)' }]}>
              Campana
            </Text>
            <Text style={[styles.statValue, { color: textOnPrimary }]} numberOfLines={1}>
              {candidate.slug}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
            <Text style={[styles.statLabel, { color: 'rgba(255,255,255,0.7)' }]}>
              Agente
            </Text>
            <Text style={[styles.statValue, { color: textOnPrimary }]} numberOfLines={1}>
              {agent.full_name}
            </Text>
            <View style={styles.trackingRow}>
              <View
                style={[
                  styles.trackingDot,
                  {
                    backgroundColor:
                      trackingState === 'foreground' || trackingState === 'background'
                        ? '#22C55E'
                        : trackingState === 'starting'
                          ? secondary
                          : trackingState === 'error'
                            ? '#EF4444'
                            : '#94A3B8',
                  },
                ]}
              />
              <Text style={[styles.trackingLabel, { color: 'rgba(255,255,255,0.6)' }]}>
                {trackingState === 'foreground'
                  ? 'GPS activo'
                  : trackingState === 'background'
                    ? 'GPS background'
                    : trackingState === 'starting'
                      ? 'Iniciando...'
                      : trackingState === 'error'
                        ? 'GPS error'
                        : 'GPS off'}
              </Text>
            </View>
          </View>
        </View>

        {/* Accent stripe */}
        <View style={styles.accentStripe}>
          <View style={[styles.accentLeft, { backgroundColor: secondary }]} />
          <View style={[styles.accentRight, { backgroundColor: 'rgba(255,255,255,0.3)' }]} />
        </View>
      </View>

      {/* Records list - placeholder */}
      <FlatList
        data={placeholderRecords}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No hay registros aun.</Text>
            <Text style={styles.emptySubtext}>Presiona + para agregar el primero.</Text>
          </View>
        }
      />

      {/* FAB */}
      <Pressable
        style={[styles.fab, { backgroundColor: primary, borderColor: secondary }]}
        onPress={() => router.push('/(main)/new-form')}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { padding: 16, gap: 14 },
  heroCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 14,
  },
  candidateImage: {
    width: 80,
    height: 80,
    borderRadius: 16,
  },
  candidateImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { fontSize: 32, fontFamily: FONT },
  headerTextBlock: { flex: 1, gap: 2 },
  headerOverline: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontFamily: FONT,
  },
  headerName: { fontSize: 20, fontFamily: FONT },
  headerRole: { fontSize: 13, fontFamily: FONT },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  badgeText: { fontSize: 12, fontFamily: FONT },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  statLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: FONT,
  },
  statValue: {
    fontSize: 18,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
    fontFamily: FONT,
  },
  accentStripe: { flexDirection: 'row', height: 4, borderRadius: 2 },
  accentLeft: { flex: 0.6 },
  accentRight: { flex: 0.4 },
  content: { padding: 16, paddingBottom: 120 },
  tableRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
    padding: 12,
  },
  rowContent: { gap: 2 },
  rowAgent: { fontSize: 14, color: '#163960', fontFamily: FONT },
  rowField: { fontSize: 12, color: 'rgba(22, 57, 96, 0.7)', fontFamily: FONT },
  rowDate: { fontSize: 11, color: 'rgba(22, 57, 96, 0.5)', fontFamily: FONT, marginTop: 4 },
  emptyState: { padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 16, color: '#163960', fontFamily: FONT },
  emptySubtext: { fontSize: 13, color: 'rgba(22, 57, 96, 0.7)', fontFamily: FONT },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  trackingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  trackingLabel: {
    fontSize: 10,
    fontFamily: FONT,
    letterSpacing: 0.3,
  },
  fab: {
    position: 'absolute',
    right: 22,
    bottom: 28,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#06121F',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 2,
  },
  fabText: { color: '#FFFFFF', fontSize: 28, marginTop: -2, fontFamily: FONT },
});

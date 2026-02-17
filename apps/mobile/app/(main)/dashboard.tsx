/**
 * Dashboard — Minimalista y adaptado a móvil.
 *
 * Muestra:
 * - Header con foto del candidato (memo para evitar re-renders)
 * - Stats de registros
 * - Lista de registros recientes
 * - FAB para nuevo formulario
 */

import { Image } from 'expo-image';
import { memo, useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useCandidate, useAgent, useApp, useActiveCampaign } from '@/lib/app-context';
import { useAgentTracking } from '@/hooks/useAgentTracking';
import { getQueueStats, getLocalFormsByCampaign, type PendingForm } from '@/lib/offline-queue';

const FONT = 'Montserrat-Bold';

// Base URL for candidate photos (served from Vercel web app)
const PHOTO_BASE_URL = 'https://maquina-electoral-goberna-web.vercel.app';

// ─── Memoized Header Component ─────────────────────────────────

interface HeaderProps {
  candidateName: string;
  candidateCargo: string;
  candidatePartido: string;
  candidateNumero: number;
  photoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  agentName: string;
  trackingActive: boolean;
  stats: { total: number; synced: number; pending: number };
}

const DashboardHeader = memo(function DashboardHeader({
  candidateName,
  candidateCargo,
  candidatePartido,
  candidateNumero,
  photoUrl,
  primaryColor,
  secondaryColor,
  agentName,
  trackingActive,
  stats,
}: HeaderProps) {
  return (
    <View style={[styles.header, { backgroundColor: primaryColor }]}>
      {/* Candidate card */}
      <View style={styles.candidateCard}>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.candidatePhoto}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.candidatePhotoPlaceholder, { backgroundColor: secondaryColor }]}>
            <Text style={[styles.placeholderInitial, { color: primaryColor }]}>
              {candidateName.charAt(0)}
            </Text>
          </View>
        )}
        <View style={styles.candidateInfo}>
          <Text style={styles.candidateName}>{candidateName}</Text>
          <Text style={styles.candidateCargo}>{candidateCargo}</Text>
          <Text style={[styles.candidatePartido, { color: secondaryColor }]}>
            {candidatePartido} · #{candidateNumero}
          </Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stats.total}</Text>
          <Text style={styles.statLabel}>Registros</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#4ade80' }]}>{stats.synced}</Text>
          <Text style={styles.statLabel}>Sincronizados</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: secondaryColor }]}>{stats.pending}</Text>
          <Text style={styles.statLabel}>Pendientes</Text>
        </View>
      </View>

      {/* Agent info bar */}
      <View style={styles.agentBar}>
        <View style={styles.agentInfo}>
          <Text style={styles.agentLabel}>Agente:</Text>
          <Text style={styles.agentName}>{agentName}</Text>
        </View>
        <View style={styles.gpsStatus}>
          <View style={[styles.gpsDot, { backgroundColor: trackingActive ? '#4ade80' : '#94a3b8' }]} />
          <Text style={styles.gpsLabel}>{trackingActive ? 'GPS' : 'GPS off'}</Text>
        </View>
      </View>
    </View>
  );
});

// ─── Form Item Component ────────────────────────────────────────

interface LocalFormData {
  nombre?: string;
  telefono?: string;
  fecha?: string;
}

const FormItem = memo(function FormItem({
  form,
  primaryColor,
}: {
  form: PendingForm;
  primaryColor: string;
}) {
  let data: LocalFormData = {};
  try {
    data = JSON.parse(form.payload);
  } catch {
    // ignore
  }

  const isSynced = form.sync_status === 'synced';
  const isFailed = form.sync_status === 'failed';

  // Format time
  const formDate = data.fecha ? new Date(data.fecha) : new Date(form.created_at);
  const timeStr = formDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.formItem}>
      <View style={[styles.formItemIndicator, { backgroundColor: primaryColor }]} />
      <View style={styles.formItemContent}>
        <View style={styles.formItemRow}>
          <Text style={styles.formItemName} numberOfLines={1}>
            {data.nombre || 'Sin nombre'}
          </Text>
          <Text style={styles.formItemTime}>{timeStr}</Text>
        </View>
        <View style={styles.formItemRow}>
          <Text style={styles.formItemPhone}>{data.telefono || '---'}</Text>
          <View style={[
            styles.statusDot,
            { backgroundColor: isSynced ? '#4ade80' : isFailed ? '#f87171' : '#fbbf24' }
          ]} />
        </View>
      </View>
    </View>
  );
});

// ─── Empty State ────────────────────────────────────────────────

const EmptyState = memo(function EmptyState({ primaryColor }: { primaryColor: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>📋</Text>
      <Text style={[styles.emptyTitle, { color: primaryColor }]}>Sin registros</Text>
      <Text style={styles.emptySubtitle}>Toca + para agregar</Text>
    </View>
  );
});

// ─── Screen ─────────────────────────────────────────────────────

export default function DashboardScreen() {
  const router = useRouter();
  const candidate = useCandidate();
  const agent = useAgent();
  const campaign = useActiveCampaign();
  const { refreshConfig } = useApp();

  // Tracking state (with error handling)
  const { trackingState } = useAgentTracking();
  const trackingActive = trackingState === 'foreground' || trackingState === 'background';

  const primary = candidate.color_primario;
  const secondary = candidate.color_secundario;

  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ total: 0, synced: 0, pending: 0 });
  const [localForms, setLocalForms] = useState<PendingForm[]>([]);

  // Build photo URL once
  const photoUrl = candidate.foto_url
    ? candidate.foto_url.startsWith('http')
      ? candidate.foto_url
      : `${PHOTO_BASE_URL}${candidate.foto_url}`
    : null;

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [queueStats, forms] = await Promise.all([
        getQueueStats(),
        getLocalFormsByCampaign(campaign.id, 50),
      ]);

      const formsPending = queueStats.forms?.pending ?? 0;
      const formsSynced = queueStats.forms?.synced ?? 0;
      setStats({
        total: formsPending + formsSynced,
        synced: formsSynced,
        pending: formsPending,
      });

      setLocalForms(forms);
    } catch (err) {
      console.warn('Failed to load data:', err);
    }
  }, [campaign.id]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshConfig(), loadData()]);
    setRefreshing(false);
  }, [refreshConfig, loadData]);

  const renderItem = useCallback(({ item }: { item: PendingForm }) => (
    <FormItem form={item} primaryColor={primary} />
  ), [primary]);

  const renderHeader = useCallback(() => (
    <>
      <DashboardHeader
        candidateName={candidate.name}
        candidateCargo={candidate.cargo}
        candidatePartido={candidate.partido}
        candidateNumero={candidate.numero}
        photoUrl={photoUrl}
        primaryColor={primary}
        secondaryColor={secondary}
        agentName={agent.full_name}
        trackingActive={trackingActive}
        stats={stats}
      />
      {localForms.length > 0 && (
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: primary }]}>Recientes</Text>
        </View>
      )}
    </>
  ), [candidate, photoUrl, primary, secondary, agent.full_name, trackingActive, stats, localForms.length]);

  const renderEmpty = useCallback(() => (
    <EmptyState primaryColor={primary} />
  ), [primary]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={localForms}
        keyExtractor={(item) => item.client_id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />
        }
      />

      {/* FAB */}
      <Pressable
        style={[styles.fab, { backgroundColor: primary }]}
        onPress={() => router.push('/(main)/new-form')}
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 100,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  candidateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  candidatePhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e2e8f0',
  },
  candidatePhotoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderInitial: {
    fontSize: 28,
    fontFamily: FONT,
  },
  candidateInfo: {
    flex: 1,
  },
  candidateName: {
    fontSize: 20,
    fontFamily: FONT,
    color: '#ffffff',
  },
  candidateCargo: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: FONT,
    marginTop: 2,
  },
  candidatePartido: {
    fontSize: 12,
    fontFamily: FONT,
    marginTop: 4,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: '100%',
  },
  statNumber: {
    fontSize: 24,
    fontFamily: FONT,
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: FONT,
    textTransform: 'uppercase',
    marginTop: 2,
  },

  // Agent bar
  agentBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  agentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  agentLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: FONT,
  },
  agentName: {
    fontSize: 12,
    color: '#ffffff',
    fontFamily: FONT,
  },
  gpsStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  gpsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  gpsLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: FONT,
  },

  // Section
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Form items
  formItem: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  formItemIndicator: {
    width: 4,
  },
  formItemContent: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  formItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  formItemName: {
    fontSize: 15,
    fontFamily: FONT,
    color: '#1e293b',
    flex: 1,
    marginRight: 8,
  },
  formItemTime: {
    fontSize: 12,
    color: '#94a3b8',
    fontFamily: FONT,
  },
  formItemPhone: {
    fontSize: 13,
    color: '#64748b',
    fontFamily: FONT,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Empty state
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
    fontFamily: FONT,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    fontFamily: FONT,
    marginTop: 4,
  },

  // FAB
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
    fontFamily: FONT,
    marginTop: -2,
  },
});

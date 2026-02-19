/**
 * Dashboard — Minimalista y adaptado a móvil.
 *
 * Muestra:
 * - Header con foto del candidato (memo para evitar re-renders)
 * - Stats de registros
 * - Lista de registros recientes
 * - FAB para nuevo formulario
 * - Menu de opciones (logout, cambiar candidato)
 */

import { Image } from 'expo-image';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';

import { useCandidate, useAgent, useApp, useActiveCampaign } from '@/lib/app-context';
import { useAgentTracking } from '@/hooks/useAgentTracking';
import { getQueueStats, getLocalFormsByCampaign, type PendingForm } from '@/lib/offline-queue';
import { appEvents } from '@/lib/events';
import type { CampaignMembership } from '@/lib/types';

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
  agentRole: string;
  trackingActive: boolean;
  stats: { total: number; synced: number; pending: number };
  onMenuPress: () => void;
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
  agentRole,
  trackingActive,
  stats,
  onMenuPress,
}: HeaderProps) {
  return (
    <View style={[styles.header, { backgroundColor: primaryColor }]}>
      {/* Menu button */}
      <Pressable style={styles.menuButton} onPress={onMenuPress} hitSlop={12}>
        <MaterialIcons name="settings" size={22} color="rgba(255,255,255,0.8)" />
      </Pressable>

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
          <Text style={styles.agentLabel}>{agentRole === 'admin' ? 'Admin:' : 'Agente:'}</Text>
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

// ─── Options Menu Modal ─────────────────────────────────────

interface OptionsMenuProps {
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
  onSwitchCampaign: (campaignId: string) => void;
  campaigns: CampaignMembership[];
  activeCampaignId: string;
  isAdmin: boolean;
  isConsultor: boolean;
  primaryColor: string;
}

const OptionsMenu = memo(function OptionsMenu({
  visible,
  onClose,
  onLogout,
  onSwitchCampaign,
  campaigns,
  activeCampaignId,
  isAdmin,
  isConsultor,
  primaryColor,
}: OptionsMenuProps) {
  // Show campaign switcher for admin, consultor, or users with multiple campaigns
  const showCampaignSwitcher = isAdmin || isConsultor || campaigns.length > 1;

  const handleLogout = () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro que deseas cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar Sesión', style: 'destructive', onPress: onLogout },
      ],
    );
  };

  // Determine label for campaign switcher
  const switcherLabel = isAdmin 
    ? 'Cambiar Candidato (Admin)' 
    : isConsultor 
      ? 'Cambiar Candidato (Consultor)' 
      : 'Cambiar Candidato';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={styles.menuContainer}>
          <View style={styles.menuHeader}>
            <Text style={[styles.menuTitle, { color: primaryColor }]}>Opciones</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={20} color="#94a3b8" />
            </Pressable>
          </View>

          {showCampaignSwitcher && (
            <>
              <Text style={styles.sectionLabel}>
                {switcherLabel}
              </Text>
              <View style={styles.campaignList}>
                {campaigns.map((c) => (
                  <Pressable
                    key={c.id}
                    style={[
                      styles.campaignItem,
                      c.id === activeCampaignId && { backgroundColor: `${primaryColor}15` },
                    ]}
                    onPress={() => {
                      if (c.id !== activeCampaignId) {
                        onSwitchCampaign(c.id);
                        onClose();
                      }
                    }}
                  >
                    <View style={[styles.campaignIndicator, { backgroundColor: c.id === activeCampaignId ? primaryColor : '#e2e8f0' }]} />
                    <Text style={[styles.campaignName, c.id === activeCampaignId && { color: primaryColor, fontWeight: '700' }]}>
                      {c.name}
                    </Text>
                    {c.id === activeCampaignId && <Text style={styles.checkmark}>✓</Text>}
                  </Pressable>
                ))}
              </View>
              <View style={styles.menuDivider} />
            </>
          )}

          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <MaterialIcons name="logout" size={18} color="#dc2626" style={styles.logoutIcon} />
            <Text style={styles.logoutText}>Cerrar Sesión</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
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
  const { refreshConfig, logout, switchCampaign, availableCampaigns } = useApp();

  // Tracking state (with error handling)
  const { trackingState } = useAgentTracking();
  const trackingActive = trackingState === 'foreground' || trackingState === 'background';

  const primary = candidate.color_primario;
  const secondary = candidate.color_secundario;

  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ total: 0, synced: 0, pending: 0 });
  const [localForms, setLocalForms] = useState<PendingForm[]>([]);
  const [showMenu, setShowMenu] = useState(false);

  // Build photo URL once
  const photoUrl = candidate.foto_url
    ? candidate.foto_url.startsWith('http')
      ? candidate.foto_url
      : `${PHOTO_BASE_URL}${candidate.foto_url}`
    : null;

  // Refs to avoid re-renders when data hasn't changed
  const prevStatsRef = useRef(stats);
  const prevFormsRef = useRef<PendingForm[]>(localForms);

  // Load data with shallow equality check — only sets state when data actually changed
  const loadData = useCallback(async () => {
    try {
      const [queueStats, forms] = await Promise.all([
        getQueueStats(),
        getLocalFormsByCampaign(campaign.id, 50),
      ]);

      const formsPending = queueStats.forms?.pending ?? 0;
      const formsSynced = queueStats.forms?.synced ?? 0;
      const newStats = {
        total: formsPending + formsSynced,
        synced: formsSynced,
        pending: formsPending,
      };

      // Only update stats if values changed
      const prev = prevStatsRef.current;
      if (prev.total !== newStats.total || prev.synced !== newStats.synced || prev.pending !== newStats.pending) {
        prevStatsRef.current = newStats;
        setStats(newStats);
      }

      // Only update forms list if contents changed (compare by ids + sync_status)
      const prevForms = prevFormsRef.current;
      const changed =
        forms.length !== prevForms.length ||
        forms.some((f, i) => f.client_id !== prevForms[i]?.client_id || f.sync_status !== prevForms[i]?.sync_status);
      if (changed) {
        prevFormsRef.current = forms;
        setLocalForms(forms);
      }
    } catch (err) {
      console.warn('Failed to load data:', err);
    }
  }, [campaign.id]);

  // Reload when tab gains focus (coming back from new-form, other tabs, etc.)
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // Reload instantly when a form is queued (event from new-form screen)
  useEffect(() => {
    return appEvents.on('forms:changed', loadData);
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshConfig(), loadData()]);
    setRefreshing(false);
  }, [refreshConfig, loadData]);

  const renderItem = useCallback(({ item }: { item: PendingForm }) => (
    <FormItem form={item} primaryColor={primary} />
  ), [primary]);

  const handleSwitchCampaign = useCallback(async (campaignId: string) => {
    await switchCampaign(campaignId);
  }, [switchCampaign]);

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
        agentRole={agent.role}
        trackingActive={trackingActive}
        stats={stats}
        onMenuPress={() => setShowMenu(true)}
      />
      {localForms.length > 0 && (
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: primary }]}>Recientes</Text>
        </View>
      )}
    </>
  ), [candidate, photoUrl, primary, secondary, agent.full_name, agent.role, trackingActive, stats, localForms.length]);

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

      {/* Options Menu */}
      <OptionsMenu
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        onLogout={logout}
        onSwitchCampaign={handleSwitchCampaign}
        campaigns={availableCampaigns}
        activeCampaignId={campaign.id}
        isAdmin={agent.role === 'admin'}
        isConsultor={agent.role === 'consultor'}
        primaryColor={primary}
      />
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

  // Menu button
  menuButton: {
    position: 'absolute',
    top: 8,
    right: 12,
    padding: 8,
    zIndex: 10,
  },


  // Options modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menuContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 340,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 10,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  menuTitle: {
    fontSize: 18,
    fontFamily: FONT,
  },

  sectionLabel: {
    fontSize: 11,
    fontFamily: FONT,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  campaignList: {
    marginBottom: 12,
  },
  campaignItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  campaignIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  campaignName: {
    flex: 1,
    fontSize: 15,
    color: '#1e293b',
    fontFamily: FONT,
  },
  checkmark: {
    fontSize: 14,
    color: '#4ade80',
    fontFamily: FONT,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
  },
  logoutIcon: {
    marginRight: 10,
  },
  logoutText: {
    fontSize: 15,
    color: '#dc2626',
    fontFamily: FONT,
  },
});

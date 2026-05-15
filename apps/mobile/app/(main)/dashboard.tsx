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

import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { FormActionSheet } from '@/components/dashboard/FormActionSheet';
import { FormItem } from '@/components/dashboard/FormItem';
import { OptionsMenu } from '@/components/dashboard/OptionsMenu';
import { FontFamily } from '@/constants/theme';
import { useAgentTracking } from '@/hooks/useAgentTracking';
import { getMyClientIds, getMySubmissionStats } from '@/lib/api';
import { useActiveCampaign, useAgent, useApp, useCandidate } from '@/lib/app-context';
import { appEvents } from '@/lib/events';
import {
  deleteLocalForm,
  getLocalFormsByCampaign,
  getQueueStats,
  getSyncedClientIds,
  markFormsAsGhost,
  type PendingForm,
} from '@/lib/offline-queue';

// Base URL para fotos de candidatos. Se lee del mismo config que la API.
// Así si el proyecto Vercel cambia de nombre solo hay que actualizar app.json.
const _apiBase: string = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_API_URL ?? 'https://api.goberna.us/api';
const PHOTO_BASE_URL = _apiBase.replace(/\/api$/, '');

export default function DashboardScreen() {
  const router = useRouter();
  const candidate = useCandidate();
  const agent = useAgent();
  const campaign = useActiveCampaign();
  const { refreshConfig, logout, switchCampaign, availableCampaigns } = useApp();

  // Tracking state (with error handling)
  // needsPermission: true when GPS hasn't been granted yet.
  // requestPermission: MUST only be called from a user tap (Apple 5.1.1).
  const { trackingState, needsPermission, requestPermission } = useAgentTracking();
  const trackingActive = trackingState === 'foreground' || trackingState === 'background';

  const primary = candidate.color_primario;
  const secondary = candidate.color_secundario;

  const [refreshing, setRefreshing] = useState(false);
  // initialLoading: true hasta que loadData completa la primera vez
  // Evita mostrar el "EmptyState" falso mientras los datos están cargando
  const [initialLoading, setInitialLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, synced: 0, pending: 0, rejected: 0 });
  const [localForms, setLocalForms] = useState<PendingForm[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [selectedForm, setSelectedForm] = useState<PendingForm | null>(null);

  const photoUrl = candidate.foto_url
    ? candidate.foto_url.startsWith('http')
      ? candidate.foto_url
      : `${PHOTO_BASE_URL}${candidate.foto_url}`
    : null;

  // Refs to avoid re-renders when data hasn't changed
  const prevStatsRef = useRef(stats);
  const prevFormsRef = useRef<PendingForm[]>(localForms);

  // Load data with shallow equality check — only sets state when data actually changed.
  // Also reconciles local "synced" forms against server truth to detect ghost forms.
  const loadData = useCallback(async () => {
    try {
      const [queueStats, forms, serverStats, clientIdsResult] = await Promise.all([
        getQueueStats(),
        getLocalFormsByCampaign(campaign?.id ?? '', 200),
        getMySubmissionStats(),
        getMyClientIds(),
      ]);

      // Reconciliation: forms marked "synced" locally but not confirmed by the
      // server were dropped by the write-behind queue. Re-flag as "ghost" so
      // the sync service re-submits them.
      if (clientIdsResult.ok && clientIdsResult.data) {
        const serverSet = new Set(clientIdsResult.data.client_ids);
        const localSynced = await getSyncedClientIds(campaign?.id ?? '');
        const ghostIds = localSynced
          .filter((f) => !serverSet.has(f.client_id))
          .map((f) => f.id);
        if (ghostIds.length > 0) {
          await markFormsAsGhost(ghostIds);
        }
      }

      const [updatedQueueStats, updatedForms] = await Promise.all([
        getQueueStats(),
        getLocalFormsByCampaign(campaign?.id ?? '', 200),
      ]);

      const formsPending = (updatedQueueStats.forms?.pending ?? 0) + (updatedQueueStats.forms?.ghost ?? 0);
      const formsRejected = updatedQueueStats.forms?.rejected ?? 0;
      // Server total is source of truth — phone-dedup'd, includes >7d-old synced
      // submissions cleaned from local SQLite. Only fall back to SQLite on offline.
      const serverOk = serverStats.ok === true;
      const serverTotal = serverOk ? (serverStats.data?.stats.total ?? 0) : 0;

      const newStats = {
        total: serverOk ? serverTotal + formsPending : formsPending + (updatedQueueStats.forms?.synced ?? 0),
        synced: serverOk ? serverTotal : (updatedQueueStats.forms?.synced ?? 0),
        pending: formsPending,
        rejected: formsRejected,
      };

      const prev = prevStatsRef.current;
      if (
        prev.total !== newStats.total ||
        prev.synced !== newStats.synced ||
        prev.pending !== newStats.pending ||
        prev.rejected !== newStats.rejected
      ) {
        prevStatsRef.current = newStats;
        setStats(newStats);
      }

      const prevForms = prevFormsRef.current;
      const changed =
        updatedForms.length !== prevForms.length ||
        updatedForms.some(
          (f, i) => f.client_id !== prevForms[i]?.client_id || f.sync_status !== prevForms[i]?.sync_status,
        );
      if (changed) {
        prevFormsRef.current = updatedForms;
        setLocalForms(updatedForms);
      }
    } catch (err) {
      console.warn('Failed to load data:', err);
    } finally {
      setInitialLoading(false);
    }
  }, [campaign?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  useEffect(() => {
    return appEvents.on('forms:changed', loadData);
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshConfig(), loadData()]);
    setRefreshing(false);
  }, [refreshConfig, loadData]);

  const handleFormPress = useCallback((form: PendingForm) => {
    setSelectedForm(form);
  }, []);

  const handleEditForm = useCallback(
    (form: PendingForm) => {
      try {
        const payload = JSON.parse(form.payload);
        router.push({
          pathname: '/(main)/new-form',
          params: { prefill: JSON.stringify(payload) },
        });
      } catch {
        router.push('/(main)/new-form');
      }
    },
    [router],
  );

  const handleDeleteForm = useCallback(
    async (form: PendingForm) => {
      await deleteLocalForm(form.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadData();
    },
    [loadData],
  );

  const renderItem = useCallback(
    ({ item }: { item: PendingForm }) => (
      <FormItem form={item} primaryColor={primary} onPress={handleFormPress} />
    ),
    [primary, handleFormPress],
  );

  const handleSwitchCampaign = useCallback(
    async (campaignId: string) => {
      await switchCampaign(campaignId);
    },
    [switchCampaign],
  );

  const renderHeader = useCallback(
    () => (
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
    ),
    [candidate, photoUrl, primary, secondary, agent.full_name, agent.role, trackingActive, stats, localForms.length],
  );

  const renderEmpty = useCallback(() => {
    if (initialLoading) {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator color={primary} size="large" />
        </View>
      );
    }
    return <EmptyState primaryColor={primary} />;
  }, [primary, initialLoading]);

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

      {/* GPS Permission Banner — requestPermission() must run inside a user
          onPress so the iOS system dialog is triggered by a direct user action
          (Apple guideline 5.1.1). */}
      {needsPermission && (
        <View style={[styles.permissionBanner, { borderColor: primary }]}>
          <MaterialIcons name="location-off" size={20} color={primary} />
          <Text style={styles.permissionText}>
            Activa el GPS para registrar tu ubicación durante el trabajo de campo.
          </Text>
          <Pressable
            style={[styles.permissionButton, { backgroundColor: primary }]}
            onPress={requestPermission}
            accessibilityLabel="Activar GPS"
          >
            <Text style={styles.permissionButtonText}>Activar GPS</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        style={[styles.qrFab, { backgroundColor: primary }]}
        onPress={() => router.push('/(main)/qr-code')}
      >
        <MaterialIcons name="qr-code-2" size={26} color="#ffffff" />
      </Pressable>

      <Pressable
        style={[styles.fab, { backgroundColor: primary }]}
        onPress={() => router.push('/(main)/new-form')}
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>

      <OptionsMenu
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        onLogout={logout}
        onSwitchCampaign={handleSwitchCampaign}
        campaigns={availableCampaigns}
        activeCampaignId={campaign?.id ?? ''}
        isAdmin={agent.role === 'admin'}
        isConsultor={agent.role === 'consultor'}
        primaryColor={primary}
      />

      <FormActionSheet
        form={selectedForm}
        onClose={() => setSelectedForm(null)}
        onEdit={handleEditForm}
        onDelete={handleDeleteForm}
        primaryColor={primary}
        agentName={agent.full_name}
        candidateName={candidate.name}
        waTarget={((campaign as Record<string, unknown>).whatsapp_number as string) ?? '51999999999'}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 100,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: FontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  qrFab: {
    position: 'absolute',
    left: 20,
    bottom: 24,
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 5,
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
  permissionBanner: {
    position: 'absolute',
    bottom: 88,
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 4,
  },
  permissionText: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    fontFamily: FontFamily.bold,
  },
  permissionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  permissionButtonText: {
    fontSize: 13,
    color: '#fff',
    fontFamily: FontFamily.bold,
  },
});

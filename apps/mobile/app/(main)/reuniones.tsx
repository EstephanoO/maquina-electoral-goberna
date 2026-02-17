/**
 * Reuniones — Lista de meets + detalle con participantes y contador de datos.
 *
 * - Carga meets reales desde GET /api/meets/active
 * - Admin/supervisor pueden crear meets con FAB (+)
 * - Click en meet abre detalle con participantes y form count
 * - Admin/supervisor ven seccion "Equipo" con todos los agentes de la campana
 * - Pull to refresh
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';

import { useApp } from '@/lib/app-context';
import { appEvents } from '@/lib/events';
import * as api from '@/lib/api';
import type { Meet, MeetSummary, MeetParticipant, CampaignMember } from '@/lib/types';

const FONT = 'Montserrat-Bold';
const BORDER = '#E1E6F0';

const STATUS_LABELS: Record<string, string> = {
  pending_location: 'Sin ubicacion',
  scheduled: 'Programado',
  active: 'En curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  pending_location: '#F59E0B',
  scheduled: '#3B82F6',
  active: '#22C55E',
  completed: '#6B7280',
  cancelled: '#EF4444',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  agent: 'Agente',
};

const ROLE_ICONS: Record<string, string> = {
  admin: 'admin-panel-settings',
  supervisor: 'manage-accounts',
  agent: 'person',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const month = months[d.getMonth()]!;
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${day} ${month} · ${hours}:${mins}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════

export default function ReunionesScreen() {
  const { auth } = useApp();

  // Derive config safely (may be undefined when not active)
  const config = auth.status === 'active' ? auth.config : null;
  const campaignId = config?.campaign.id ?? '';
  const agentRole = config?.agent.role ?? 'agent';
  const canSeeTeam = agentRole === 'admin' || agentRole === 'supervisor';

  const [meets, setMeets] = useState<Meet[]>([]);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedMeetId, setSelectedMeetId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'meets' | 'equipo'>('meets');

  const fetchMeets = useCallback(async () => {
    const result = await api.getActiveMeets();
    if (result.ok) {
      setMeets(result.data.meets);
    }
  }, []);

  const fetchMembers = useCallback(async () => {
    if (!canSeeTeam || !campaignId) return;
    const result = await api.getCampaignMembers(campaignId);
    if (result.ok) {
      setMembers(result.data.members);
    }
  }, [campaignId, canSeeTeam]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchMeets(), fetchMembers()]);
  }, [fetchMeets, fetchMembers]);

  // Load on mount
  useEffect(() => {
    if (auth.status !== 'active') return;
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll, auth.status]);

  // Reload when tab gains focus (coming back from other tabs)
  useFocusEffect(
    useCallback(() => {
      if (auth.status === 'active') fetchMeets();
    }, [auth.status, fetchMeets]),
  );

  // Reload when a meet is created/updated from any screen
  useEffect(() => {
    return appEvents.on('meets:changed', fetchMeets);
  }, [fetchMeets]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const handleJoin = useCallback(async (meetId: string) => {
    const result = await api.joinMeet(meetId);
    if (result.ok) {
      Alert.alert('Listo', 'Te uniste a la reunion');
      await fetchMeets();
    } else {
      Alert.alert('Error', result.error);
    }
  }, [fetchMeets]);

  const handleCreated = useCallback(async () => {
    setShowCreate(false);
    await fetchMeets();
    appEvents.emit('meets:changed');
  }, [fetchMeets]);

  // Early return AFTER all hooks
  if (auth.status !== 'active' || !config) return null;

  const { candidate, agent, campaign } = config;
  const primary = candidate.color_primario;
  const secondary = candidate.color_secundario;
  const canCreate = agent.role === 'admin' || agent.role === 'supervisor';

  // ── Render meet card ────────────────────────────────────
  const renderMeet = ({ item }: { item: Meet }) => (
    <Pressable onPress={() => setSelectedMeetId(item.id)}>
      <View style={styles.meetCard}>
        <View style={styles.meetHeader}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] ?? '#6B7280' }]} />
          <Text style={[styles.meetTitle, { color: primary }]} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] ?? '#6B7280' }]}>
            <Text style={styles.statusBadgeText}>{STATUS_LABELS[item.status] ?? item.status}</Text>
          </View>
        </View>

        {item.description ? (
          <Text style={styles.meetDescription} numberOfLines={2}>{item.description}</Text>
        ) : null}

        <View style={styles.meetMeta}>
          <View style={styles.metaRow}>
            <MaterialIcons name="schedule" size={14} color="rgba(22,57,96,0.5)" />
            <Text style={styles.metaText}>{formatDate(item.starts_at)}</Text>
          </View>
          {item.location_name ? (
            <View style={styles.metaRow}>
              <MaterialIcons name="place" size={14} color="rgba(22,57,96,0.5)" />
              <Text style={styles.metaText}>{item.location_name}</Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <MaterialIcons name="people" size={14} color="rgba(22,57,96,0.5)" />
            <Text style={styles.metaText}>
              {item.participant_count ?? 0} participante{(item.participant_count ?? 0) !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          {(item.status === 'scheduled' || item.status === 'active') && (
            <Pressable
              style={[styles.joinBtn, { backgroundColor: primary }]}
              onPress={() => handleJoin(item.id)}
            >
              <MaterialIcons name="login" size={14} color="#FFF" />
              <Text style={styles.joinBtnText}>Unirme</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          <MaterialIcons name="chevron-right" size={20} color="rgba(22,57,96,0.3)" />
        </View>
      </View>
    </Pressable>
  );

  // ── Render member card ──────────────────────────────────
  const renderMember = ({ item }: { item: CampaignMember }) => (
    <View style={styles.memberCard}>
      <View style={[styles.memberAvatar, { backgroundColor: primary + '18' }]}>
        <MaterialIcons
          name={(ROLE_ICONS[item.role] ?? 'person') as keyof typeof MaterialIcons.glyphMap}
          size={20}
          color={primary}
        />
      </View>
      <View style={styles.memberInfo}>
        <Text style={[styles.memberName, { color: primary }]} numberOfLines={1}>{item.full_name}</Text>
        <Text style={styles.memberEmail} numberOfLines={1}>{item.email}</Text>
      </View>
      <View style={[styles.roleBadge, { backgroundColor: primary + '15' }]}>
        <Text style={[styles.roleBadgeText, { color: primary }]}>{ROLE_LABELS[item.role] ?? item.role}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.header, { backgroundColor: primary }]}>
        <Text style={styles.title}>Reuniones</Text>
        <Text style={styles.subtitle}>{candidate.name}</Text>
      </View>

      {/* Tabs (only if can see team) */}
      {canSeeTeam && (
        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tab, activeTab === 'meets' && { borderBottomColor: primary, borderBottomWidth: 3 }]}
            onPress={() => setActiveTab('meets')}
          >
            <MaterialIcons name="event" size={16} color={activeTab === 'meets' ? primary : 'rgba(22,57,96,0.4)'} />
            <Text style={[styles.tabText, activeTab === 'meets' && { color: primary }]}>
              Reuniones ({meets.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'equipo' && { borderBottomColor: primary, borderBottomWidth: 3 }]}
            onPress={() => setActiveTab('equipo')}
          >
            <MaterialIcons name="groups" size={16} color={activeTab === 'equipo' ? primary : 'rgba(22,57,96,0.4)'} />
            <Text style={[styles.tabText, activeTab === 'equipo' && { color: primary }]}>
              Equipo ({members.length})
            </Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={primary} />
        </View>
      ) : activeTab === 'meets' ? (
        <FlatList
          data={meets}
          keyExtractor={(m) => m.id}
          renderItem={renderMeet}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="event-busy" size={48} color="rgba(22,57,96,0.2)" />
              <Text style={[styles.emptyTitle, { color: primary }]}>Sin reuniones activas</Text>
              <Text style={styles.emptyText}>
                {canCreate
                  ? 'Crea una reunion con el boton + de abajo.'
                  : 'Tu coordinador aun no ha programado reuniones.'}
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => m.user_id}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primary} />
          }
          ListHeaderComponent={
            <View style={styles.teamStats}>
              <StatPill icon="admin-panel-settings" label="Admin" count={members.filter(m => m.role === 'admin').length} color="#7C3AED" />
              <StatPill icon="manage-accounts" label="Supervisores" count={members.filter(m => m.role === 'supervisor').length} color="#2563EB" />
              <StatPill icon="person" label="Agentes" count={members.filter(m => m.role === 'agent').length} color="#059669" />
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="group-off" size={48} color="rgba(22,57,96,0.2)" />
              <Text style={[styles.emptyTitle, { color: primary }]}>Sin miembros</Text>
              <Text style={styles.emptyText}>No hay miembros asignados a esta campana.</Text>
            </View>
          }
        />
      )}

      {/* FAB — only for admin/supervisor, only on meets tab */}
      {canCreate && activeTab === 'meets' && (
        <Pressable
          style={[styles.fab, { backgroundColor: secondary }]}
          onPress={() => setShowCreate(true)}
        >
          <MaterialIcons name="add" size={28} color={primary} />
        </Pressable>
      )}

      {/* Create meet modal */}
      <CreateMeetModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
        campaignId={campaign.id}
        primary={primary}
        secondary={secondary}
      />

      {/* Meet detail modal */}
      <MeetDetailModal
        meetId={selectedMeetId}
        onClose={() => setSelectedMeetId(null)}
        primary={primary}
        secondary={secondary}
        userId={agent.id}
        userRole={agent.role}
        onRefreshList={fetchMeets}
      />
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════
// STAT PILL (for team header)
// ═══════════════════════════════════════════════════════════════

function StatPill({ icon, label, count, color }: { icon: string; label: string; count: number; color: string }) {
  return (
    <View style={[styles.statPill, { backgroundColor: color + '12' }]}>
      <MaterialIcons name={icon as keyof typeof MaterialIcons.glyphMap} size={14} color={color} />
      <Text style={[styles.statPillText, { color }]}>{count} {label}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// MEET DETAIL MODAL
// ═══════════════════════════════════════════════════════════════

function MeetDetailModal({
  meetId,
  onClose,
  primary,
  secondary,
  userId,
  userRole,
  onRefreshList,
}: {
  meetId: string | null;
  onClose: () => void;
  primary: string;
  secondary: string;
  userId: string;
  userRole: string;
  onRefreshList: () => void;
}) {
  const [summary, setSummary] = useState<MeetSummary | null>(null);
  const [participants, setParticipants] = useState<MeetParticipant[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!meetId) {
      setSummary(null);
      setParticipants([]);
      return;
    }
    setLoading(true);
    api.getMeetSummary(meetId).then((result) => {
      if (result.ok) {
        setSummary(result.data.meet);
        setParticipants(result.data.participants);
      }
    }).finally(() => setLoading(false));
  }, [meetId]);

  const reload = async () => {
    if (!meetId) return;
    const s = await api.getMeetSummary(meetId);
    if (s.ok) { setSummary(s.data.meet); setParticipants(s.data.participants); }
  };

  const handleJoin = async () => {
    if (!meetId) return;
    setActionLoading(true);
    const r = await api.joinMeet(meetId);
    if (r.ok) {
      await reload();
      onRefreshList();
    } else {
      Alert.alert('Error', r.error);
    }
    setActionLoading(false);
  };

  const handleLeave = async () => {
    if (!meetId) return;
    setActionLoading(true);
    const r = await api.leaveMeet(meetId);
    if (r.ok) {
      await reload();
      onRefreshList();
    } else {
      Alert.alert('Error', r.error);
    }
    setActionLoading(false);
  };

  const isParticipant = participants.some(p => p.user_id === userId && !p.left_at);
  const activeParticipants = participants.filter(p => !p.left_at);
  const leftParticipants = participants.filter(p => p.left_at);

  if (!meetId) return null;

  return (
    <Modal visible={!!meetId} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <View style={[styles.detailContent, { maxHeight: '85%' }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: primary }]} numberOfLines={2}>
              {summary?.title ?? 'Cargando...'}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={24} color="rgba(22,57,96,0.5)" />
            </Pressable>
          </View>

          {loading ? (
            <View style={[styles.centered, { paddingVertical: 40 }]}>
              <ActivityIndicator size="large" color={primary} />
            </View>
          ) : summary ? (
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {/* Status + date row */}
              <View style={styles.detailStatusRow}>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[summary.status] ?? '#6B7280' }]}>
                  <Text style={styles.statusBadgeText}>{STATUS_LABELS[summary.status] ?? summary.status}</Text>
                </View>
                <Text style={styles.metaText}>{formatDate(summary.starts_at)}</Text>
              </View>

              {summary.description ? (
                <Text style={styles.detailDescription}>{summary.description}</Text>
              ) : null}

              {summary.location_name ? (
                <View style={[styles.metaRow, { marginTop: 8 }]}>
                  <MaterialIcons name="place" size={16} color="rgba(22,57,96,0.5)" />
                  <Text style={styles.metaText}>{summary.location_name}</Text>
                </View>
              ) : null}

              {/* Summary counters */}
              <View style={styles.countersRow}>
                <View style={[styles.counterBox, { backgroundColor: primary + '10' }]}>
                  <MaterialIcons name="people" size={22} color={primary} />
                  <Text style={[styles.counterNumber, { color: primary }]}>{summary.active_participants}</Text>
                  <Text style={styles.counterLabel}>Activos</Text>
                </View>
                <View style={[styles.counterBox, { backgroundColor: '#22C55E12' }]}>
                  <MaterialIcons name="group" size={22} color="#22C55E" />
                  <Text style={[styles.counterNumber, { color: '#22C55E' }]}>{summary.participant_count}</Text>
                  <Text style={styles.counterLabel}>Total</Text>
                </View>
                <View style={[styles.counterBox, { backgroundColor: '#F59E0B12' }]}>
                  <MaterialIcons name="description" size={22} color="#F59E0B" />
                  <Text style={[styles.counterNumber, { color: '#F59E0B' }]}>{summary.forms_count}</Text>
                  <Text style={styles.counterLabel}>Datos</Text>
                </View>
              </View>

              {/* Join/Leave button */}
              {(summary.status === 'scheduled' || summary.status === 'active') && (
                <Pressable
                  style={[
                    styles.actionBtn,
                    { backgroundColor: isParticipant ? '#EF4444' : primary },
                    actionLoading && { opacity: 0.6 },
                  ]}
                  onPress={isParticipant ? handleLeave : handleJoin}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name={isParticipant ? 'logout' : 'login'} size={18} color="#FFF" />
                      <Text style={styles.actionBtnText}>
                        {isParticipant ? 'Salir de la reunion' : 'Unirme a la reunion'}
                      </Text>
                    </>
                  )}
                </Pressable>
              )}

              {/* Participants list */}
              <Text style={[styles.sectionTitle, { color: primary }]}>
                Participantes ({activeParticipants.length})
              </Text>

              {activeParticipants.length === 0 ? (
                <View style={styles.emptyParticipants}>
                  <MaterialIcons name="person-off" size={32} color="rgba(22,57,96,0.15)" />
                  <Text style={styles.emptyParticipantsText}>Nadie se ha unido aun</Text>
                </View>
              ) : (
                activeParticipants.map((p) => (
                  <View key={p.user_id} style={styles.participantRow}>
                    <View style={[styles.participantAvatar, { backgroundColor: primary + '18' }]}>
                      <MaterialIcons name="person" size={16} color={primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.participantName, { color: primary }]}>{p.full_name}</Text>
                      <Text style={styles.participantMeta}>
                        {ROLE_LABELS[p.role] ?? p.role} · {formatTime(p.joined_at)}
                      </Text>
                    </View>
                    {p.user_id === userId && (
                      <View style={[styles.youBadge, { backgroundColor: primary + '15' }]}>
                        <Text style={[styles.youBadgeText, { color: primary }]}>Tu</Text>
                      </View>
                    )}
                  </View>
                ))
              )}

              {/* Left participants */}
              {leftParticipants.length > 0 && (
                <>
                  <Text style={[styles.sectionSubtitle, { marginTop: 16 }]}>
                    Salieron ({leftParticipants.length})
                  </Text>
                  {leftParticipants.map((p) => (
                    <View key={p.user_id + '-left'} style={[styles.participantRow, { opacity: 0.5 }]}>
                      <View style={[styles.participantAvatar, { backgroundColor: '#E5E7EB' }]}>
                        <MaterialIcons name="person" size={16} color="#9CA3AF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.participantName, { color: '#6B7280' }]}>{p.full_name}</Text>
                        <Text style={styles.participantMeta}>{ROLE_LABELS[p.role] ?? p.role}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* Delete button — admin/supervisor only */}
              {(userRole === 'admin' || userRole === 'supervisor') && (
                <Pressable
                  style={[styles.deleteBtn, actionLoading && { opacity: 0.6 }]}
                  disabled={actionLoading}
                  onPress={() => {
                    Alert.alert(
                      'Eliminar reunion',
                      `¿Seguro que deseas eliminar "${summary.title}"? Esta accion no se puede deshacer.`,
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Eliminar',
                          style: 'destructive',
                          onPress: async () => {
                            if (!meetId) return;
                            setActionLoading(true);
                            const r = await api.deleteMeet(meetId);
                            setActionLoading(false);
                            if (r.ok) {
                              onClose();
                              onRefreshList();
                            } else {
                              Alert.alert('Error', r.error);
                            }
                          },
                        },
                      ],
                    );
                  }}
                >
                  <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
                  <Text style={styles.deleteBtnText}>Eliminar reunion</Text>
                </Pressable>
              )}

              <View style={{ height: 24 }} />
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// CREATE MEET MODAL
// ═══════════════════════════════════════════════════════════════

function CreateMeetModal({
  visible,
  onClose,
  onCreated,
  campaignId,
  primary,
  secondary,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  campaignId: string;
  primary: string;
  secondary: string;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'El titulo es obligatorio');
      return;
    }

    setSaving(true);
    const result = await api.createMeet({
      campaign_id: campaignId,
      title: title.trim(),
      description: description.trim() || undefined,
      location_name: locationName.trim() || undefined,
      starts_at: new Date().toISOString(),
    });
    setSaving(false);

    if (result.ok) {
      setTitle('');
      setDescription('');
      setLocationName('');
      onCreated();
    } else {
      Alert.alert('Error', result.error);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: primary }]}>Nueva reunion</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={24} color="rgba(22,57,96,0.5)" />
            </Pressable>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 12 }}>
              <Text style={styles.inputLabel}>Titulo *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Ej: Recorrido Zona Sur"
                placeholderTextColor="rgba(22,57,96,0.3)"
                maxLength={255}
              />

              <Text style={styles.inputLabel}>Descripcion</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={description}
                onChangeText={setDescription}
                placeholder="Detalles de la actividad..."
                placeholderTextColor="rgba(22,57,96,0.3)"
                multiline
                maxLength={500}
              />

              <Text style={styles.inputLabel}>Lugar</Text>
              <TextInput
                style={styles.input}
                value={locationName}
                onChangeText={setLocationName}
                placeholder="Ej: Parque Central"
                placeholderTextColor="rgba(22,57,96,0.3)"
                maxLength={255}
              />

              <Text style={styles.inputHint}>
                La ubicacion en el mapa se asignara desde el panel web.
              </Text>
            </View>
          </ScrollView>

          <Pressable
            style={[styles.saveBtn, { backgroundColor: primary }, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Crear reunion</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { padding: 20, paddingBottom: 16 },
  title: { fontSize: 24, color: '#FFFFFF', fontFamily: FONT },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontFamily: FONT, marginTop: 4 },

  // Tabs
  tabBar: { flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: BORDER },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 13, fontFamily: FONT, color: 'rgba(22,57,96,0.4)' },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 12, paddingBottom: 100 },

  // Empty
  emptyState: { padding: 40, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: FONT },
  emptyText: { fontSize: 13, color: 'rgba(22,57,96,0.6)', fontFamily: FONT, textAlign: 'center', lineHeight: 20 },

  // Meet card
  meetCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER, gap: 10,
  },
  meetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  meetTitle: { flex: 1, fontSize: 15, fontFamily: FONT },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText: { fontSize: 10, color: '#FFF', fontFamily: FONT, textTransform: 'uppercase' },
  meetDescription: { fontSize: 13, color: 'rgba(22,57,96,0.6)', fontFamily: FONT, lineHeight: 18 },
  meetMeta: { gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, color: 'rgba(22,57,96,0.5)', fontFamily: FONT },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },

  joinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8,
  },
  joinBtnText: { fontSize: 12, color: '#FFF', fontFamily: FONT },

  // Member card
  memberCard: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  memberAvatar: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
  },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { fontSize: 14, fontFamily: FONT },
  memberEmail: { fontSize: 11, color: 'rgba(22,57,96,0.45)', fontFamily: FONT },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  roleBadgeText: { fontSize: 10, fontFamily: FONT, textTransform: 'uppercase' },

  // Team stats
  teamStats: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  statPillText: { fontSize: 11, fontFamily: FONT },

  // FAB
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 4,
  },

  // Modals (shared)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalDismiss: { flex: 1 },
  modalContent: {
    backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40, gap: 20,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontFamily: FONT, flex: 1, marginRight: 12 },
  modalBody: { gap: 12 },
  inputLabel: {
    fontSize: 12, fontFamily: FONT, color: 'rgba(22,57,96,0.7)', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: FONT, color: '#163960',
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  inputHint: { fontSize: 11, color: 'rgba(22,57,96,0.4)', fontFamily: FONT, fontStyle: 'italic' },
  saveBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 15, color: '#FFF', fontFamily: FONT },

  // Detail modal
  detailContent: {
    backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 32, gap: 16,
  },
  detailStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailDescription: {
    fontSize: 14, color: 'rgba(22,57,96,0.7)', fontFamily: FONT, lineHeight: 20, marginTop: 8,
  },

  // Counters
  countersRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  counterBox: {
    flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, gap: 4,
  },
  counterNumber: { fontSize: 22, fontFamily: FONT },
  counterLabel: { fontSize: 10, color: 'rgba(22,57,96,0.5)', fontFamily: FONT, textTransform: 'uppercase' },

  // Action button
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 16,
  },
  actionBtnText: { fontSize: 14, color: '#FFF', fontFamily: FONT },

  // Participants
  sectionTitle: { fontSize: 14, fontFamily: FONT, marginTop: 20, marginBottom: 8 },
  sectionSubtitle: { fontSize: 12, fontFamily: FONT, color: 'rgba(22,57,96,0.5)', marginBottom: 8 },
  emptyParticipants: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyParticipantsText: { fontSize: 12, color: 'rgba(22,57,96,0.4)', fontFamily: FONT },
  participantRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  participantAvatar: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  participantName: { fontSize: 13, fontFamily: FONT },
  participantMeta: { fontSize: 11, color: 'rgba(22,57,96,0.45)', fontFamily: FONT },
  youBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  youBadgeText: { fontSize: 10, fontFamily: FONT },

  // Delete button
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 24,
    borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FEF2F2',
  },
  deleteBtnText: { fontSize: 14, color: '#EF4444', fontFamily: FONT },
});

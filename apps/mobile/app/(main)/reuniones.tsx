/**
 * Reuniones — Lista de meets + detalle con participantes y contador de datos.
 *
 * - Carga meets reales desde GET /api/meets/active
 * - Candidato y superiores pueden crear meets con FAB (+)
 * - Click en meet abre detalle con participantes y form count
 * - Candidato y superiores ven seccion "Equipo" con todos los agentes de la campana
 * - Pull to refresh
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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
import type { Meet, MeetSummary, MeetParticipant, CampaignMember, UserRole } from '@/lib/types';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/** Open WhatsApp chat with phone number */
function openWhatsApp(phone: string | null) {
  if (!phone) {
    Alert.alert('Sin telefono', 'Este usuario no tiene numero registrado.');
    return;
  }
  // Clean phone number (remove spaces, dashes)
  const cleanPhone = phone.replace(/\D/g, '');
  // Peru country code
  const fullPhone = cleanPhone.startsWith('51') ? cleanPhone : `51${cleanPhone}`;
  const url = `https://wa.me/${fullPhone}`;
  Linking.openURL(url).catch(() => Alert.alert('Error', 'No se pudo abrir WhatsApp.'));
}

const FONT = 'Montserrat-Bold';
const BORDER = '#E1E6F0';

// ── Role hierarchy (mirrors backend authorize.ts) ────────────
const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 50,
  consultor: 40,
  candidato: 30,
  brigadista_zonal: 20,
  agente_campo: 10,
  agente_digital: 10,
};

/** Returns true if roleA is strictly above roleB in the hierarchy */
function isRoleAbove(roleA: UserRole, roleB: UserRole): boolean {
  return ROLE_HIERARCHY[roleA] > ROLE_HIERARCHY[roleB];
}

/** Returns the roles that a given role can assign (strictly below their own level) */
function getAssignableRoles(myRole: UserRole): UserRole[] {
  const myLevel = ROLE_HIERARCHY[myRole];
  // admin can assign everything except admin itself
  if (myRole === 'admin') {
    return ['consultor', 'candidato', 'brigadista_zonal', 'agente_campo', 'agente_digital'];
  }
  // consultor can assign candidato and below
  if (myRole === 'consultor') {
    return ['candidato', 'brigadista_zonal', 'agente_campo', 'agente_digital'];
  }
  // candidato can only assign strictly below
  return Object.entries(ROLE_HIERARCHY)
    .filter(([_, level]) => level < myLevel)
    .map(([role]) => role as UserRole);
}

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
  consultor: 'Consultor',
  candidato: 'Candidato',
  brigadista_zonal: 'Brigadista Zonal',
  agente_campo: 'Agente de Campo',
  agente_digital: 'Agente Digital',
};

const ROLE_ICONS: Record<string, string> = {
  admin: 'admin-panel-settings',
  consultor: 'psychology',
  candidato: 'star',
  brigadista_zonal: 'map',
  agente_campo: 'person',
  agente_digital: 'computer',
};

const ROLE_COLORS: Record<string, string> = {
  admin: '#7C3AED',
  consultor: '#6366F1',
  candidato: '#2563EB',
  brigadista_zonal: '#D97706',
  agente_campo: '#059669',
  agente_digital: '#0891B2',
};

const BACKEND_ROLES = [
  { key: 'admin', label: 'Admin', icon: 'admin-panel-settings' },
  { key: 'consultor', label: 'Consultor', icon: 'psychology' },
  { key: 'candidato', label: 'Candidato', icon: 'star' },
  { key: 'brigadista_zonal', label: 'Brigadista Zonal', icon: 'map' },
  { key: 'agente_campo', label: 'Agente de Campo', icon: 'person' },
  { key: 'agente_digital', label: 'Agente Digital', icon: 'computer' },
];

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
  const agentId = config?.agent.id ?? '';
  const agentRole = config?.agent.role ?? 'agent';
  
  // Permission levels
  const isCandidatoOrAbove = agentRole === 'admin' || agentRole === 'consultor' || agentRole === 'candidato';
  const isBrigadistaZonal = agentRole === 'brigadista_zonal';
  const canSeeTeam = isCandidatoOrAbove || isBrigadistaZonal;
  const canManageRoles = isCandidatoOrAbove;   // candidato+ can change roles
  const canAcceptRequests = isCandidatoOrAbove; // candidato+ can accept new members (used in solicitudes tab)

  const [meets, setMeets] = useState<Meet[]>([]);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedMeetId, setSelectedMeetId] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<CampaignMember | null>(null);
  const [activeTab, setActiveTab] = useState<'meets' | 'equipo'>('meets');

  // Get current user's region from members list (for brigadista filtering)
  const currentUserMember = members.find(m => m.user_id === agentId);
  const userRegion = currentUserMember?.region;

  // Filter members for brigadista_zonal (only show their region)
  const filteredMembers = isBrigadistaZonal && userRegion
    ? members.filter(m => m.region === userRegion)
    : members;

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
      if (auth.status === 'active') fetchAll();
    }, [auth.status, fetchAll]),
  );

  // Reload when a meet is created/updated from any screen
  useEffect(() => {
    return appEvents.on('meets:changed', fetchMeets);
  }, [fetchMeets]);

  // Reload when a member role changes from any screen
  useEffect(() => {
    return appEvents.on('members:changed', fetchMembers);
  }, [fetchMembers]);

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
  const canCreate = isCandidatoOrAbove;

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
    <Pressable onPress={() => setSelectedMember(item)}>
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
          <View style={styles.memberMetaRow}>
            {item.phone && (
              <Text style={styles.memberPhone} numberOfLines={1}>{item.phone}</Text>
            )}
            {item.region && (
              <View style={styles.regionBadge}>
                <Text style={styles.regionBadgeText}>{item.region}</Text>
              </View>
            )}
          </View>
        </View>
        {/* WhatsApp button */}
        {item.phone && (
          <Pressable
            style={styles.whatsappBtn}
            onPress={(e) => { e.stopPropagation(); openWhatsApp(item.phone); }}
            hitSlop={8}
          >
            <MaterialIcons name="chat" size={18} color="#25D366" />
          </Pressable>
        )}
        <View style={[styles.roleBadge, { backgroundColor: primary + '15' }]}>
          <Text style={[styles.roleBadgeText, { color: primary }]}>{ROLE_LABELS[item.role] ?? item.role}</Text>
        </View>
      </View>
    </Pressable>
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
              Equipo ({filteredMembers.length})
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
          data={filteredMembers}
          keyExtractor={(m) => m.user_id}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primary} />
          }
          ListHeaderComponent={
            <View style={styles.teamStats}>
              <StatPill icon="admin-panel-settings" label="Admin" count={filteredMembers.filter(m => m.role === 'admin').length} color="#7C3AED" />
             <StatPill icon="star" label="Candidatos" count={filteredMembers.filter(m => m.role === 'candidato' || m.role === 'consultor').length} color="#2563EB" />
             <StatPill icon="map" label="Brigadistas" count={filteredMembers.filter(m => m.role === 'brigadista_zonal').length} color="#F59E0B" />
             <StatPill icon="person" label="Agentes" count={filteredMembers.filter(m => m.role === 'agente_campo' || m.role === 'agente_digital').length} color="#059669" />
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

      {/* FAB — only for candidato and above, only on meets tab */}
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

      {/* Member detail modal */}
      <MemberDetailModal
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
        primary={primary}
        secondary={secondary}
        canManageRoles={canManageRoles}
        campaignId={campaign.id}
        currentUserId={agent.id}
        currentUserRole={agent.role as UserRole}
        onRoleChanged={fetchMembers}
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

             {/* Delete button — candidato and above only */}
             {(userRole === 'admin' || userRole === 'consultor' || userRole === 'candidato') && (
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
// MEMBER DETAIL MODAL
// ═══════════════════════════════════════════════════════════════

function MemberDetailModal({
  member,
  onClose,
  primary,
  secondary,
  canManageRoles,
  campaignId,
  currentUserId,
  currentUserRole,
  onRoleChanged,
}: {
  member: CampaignMember | null;
  onClose: () => void;
  primary: string;
  secondary: string;
  canManageRoles: boolean;
  campaignId: string;
  currentUserId: string;
  currentUserRole: UserRole;
  onRoleChanged: () => void;
}) {
  const { refreshConfig } = useApp();
  const [changing, setChanging] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  useEffect(() => {
    if (member) {
      setSelectedRole(member.role);
    }
  }, [member]);

  // Determine if role change is allowed for this specific member
  const isSelf = member?.user_id === currentUserId;
  const memberRole = (member?.role ?? 'agente_campo') as UserRole;
  const canChangeThisMember = canManageRoles && !isSelf && isRoleAbove(currentUserRole, memberRole);

  // Get the roles the current user can assign
  const assignableRoles = useMemo(() => getAssignableRoles(currentUserRole), [currentUserRole]);
  const assignableRoleOptions = BACKEND_ROLES.filter(r => assignableRoles.includes(r.key as UserRole));

  const handleChangeRole = async () => {
    if (!member || !selectedRole || selectedRole === member.role) return;

    const targetLabel = ROLE_LABELS[selectedRole] ?? selectedRole;
    Alert.alert(
      'Confirmar cambio',
      `Cambiar el rol de ${member.full_name} a "${targetLabel}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setChanging(true);
            const result = await api.updateMemberRole(campaignId, member.user_id, selectedRole);
            setChanging(false);

            if (result.ok) {
              Alert.alert('Listo', `${member.full_name} ahora es ${targetLabel}.`);
              onRoleChanged();
              appEvents.emit('members:changed');
              // Refresh app context so own role updates if needed
              refreshConfig();
              onClose();
            } else {
              Alert.alert('Error', result.error);
            }
          },
        },
      ],
    );
  };

  if (!member) return null;

  const roleColor = ROLE_COLORS[member.role] ?? primary;

  return (
    <Modal visible={!!member} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalDismiss} onPress={onClose} />
        <View style={[styles.modalContent, { maxHeight: '85%' }]}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* Close handle */}
            <View style={styles.modalHandle} />

            {/* Profile header */}
            <View style={styles.memberProfileHeader}>
              <View style={[styles.memberDetailAvatar, { backgroundColor: roleColor + '18' }]}>
                <MaterialIcons
                  name={(ROLE_ICONS[member.role] ?? 'person') as keyof typeof MaterialIcons.glyphMap}
                  size={32}
                  color={roleColor}
                />
              </View>
              <Text style={[styles.memberDetailName, { color: primary }]}>{member.full_name}</Text>
              <View style={[styles.memberRolePill, { backgroundColor: roleColor + '15' }]}>
                <MaterialIcons
                  name={(ROLE_ICONS[member.role] ?? 'person') as keyof typeof MaterialIcons.glyphMap}
                  size={12}
                  color={roleColor}
                />
                <Text style={[styles.memberRolePillText, { color: roleColor }]}>
                  {ROLE_LABELS[member.role] ?? member.role}
                </Text>
              </View>
              {isSelf && (
                <View style={[styles.selfBadge, { backgroundColor: primary + '12' }]}>
                  <Text style={[styles.selfBadgeText, { color: primary }]}>Tu cuenta</Text>
                </View>
              )}
            </View>

            {/* Contact info cards */}
            <View style={styles.memberContactSection}>
              {member.email && (
                <View style={styles.contactRow}>
                  <View style={[styles.contactIconBox, { backgroundColor: '#3B82F612' }]}>
                    <MaterialIcons name="email" size={16} color="#3B82F6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.contactLabel}>Correo</Text>
                    <Text style={styles.contactValue} numberOfLines={1}>{member.email}</Text>
                  </View>
                </View>
              )}

              {member.phone && (
                <View style={styles.contactRow}>
                  <View style={[styles.contactIconBox, { backgroundColor: '#22C55E12' }]}>
                    <MaterialIcons name="phone" size={16} color="#22C55E" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.contactLabel}>Telefono</Text>
                    <Text style={styles.contactValue}>{member.phone}</Text>
                  </View>
                </View>
              )}

              {member.region && (
                <View style={styles.contactRow}>
                  <View style={[styles.contactIconBox, { backgroundColor: '#F59E0B12' }]}>
                    <MaterialIcons name="place" size={16} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.contactLabel}>Region</Text>
                    <Text style={styles.contactValue}>{member.region}</Text>
                  </View>
                </View>
              )}
            </View>

            {/* WhatsApp button */}
            {member.phone && (
              <Pressable
                style={styles.whatsappFullBtn}
                onPress={() => openWhatsApp(member.phone)}
              >
                <MaterialIcons name="chat" size={20} color="#25D366" />
                <Text style={styles.whatsappFullBtnText}>Enviar WhatsApp</Text>
              </Pressable>
            )}

            {/* Role change section — only if can manage AND target is below you AND not yourself */}
            {canChangeThisMember && assignableRoleOptions.length > 0 && (
              <View style={styles.roleChangeSection}>
                <View style={styles.roleChangeTitleRow}>
                  <MaterialIcons name="swap-vert" size={16} color="rgba(22,57,96,0.5)" />
                  <Text style={styles.roleChangeSectionTitle}>Cambiar rol</Text>
                </View>
                <View style={styles.roleOptions}>
                  {assignableRoleOptions.map((role) => {
                    const isSelected = selectedRole === role.key;
                    const isCurrent = member.role === role.key;
                    const rColor = ROLE_COLORS[role.key] ?? primary;
                    return (
                      <Pressable
                        key={role.key}
                        style={[
                          styles.roleOption,
                          isSelected && { backgroundColor: rColor + '12', borderColor: rColor },
                          isCurrent && !isSelected && { borderColor: rColor + '40', borderStyle: 'dashed' as const },
                        ]}
                        onPress={() => setSelectedRole(role.key)}
                      >
                        <View style={[styles.roleOptionIcon, { backgroundColor: rColor + '15' }]}>
                          <MaterialIcons
                            name={role.icon as keyof typeof MaterialIcons.glyphMap}
                            size={16}
                            color={rColor}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.roleOptionText,
                              isSelected && { color: rColor, fontFamily: FONT },
                            ]}
                          >
                            {role.label}
                          </Text>
                        </View>
                        {isSelected && (
                          <MaterialIcons name="check-circle" size={18} color={rColor} />
                        )}
                        {isCurrent && !isSelected && (
                          <Text style={[styles.currentRoleTag, { color: rColor }]}>actual</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                {selectedRole !== member.role && (
                  <Pressable
                    style={[styles.saveRoleBtn, { backgroundColor: primary }, changing && { opacity: 0.6 }]}
                    onPress={handleChangeRole}
                    disabled={changing}
                  >
                    {changing ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <>
                        <MaterialIcons name="check" size={18} color="#FFF" />
                        <Text style={styles.saveRoleBtnText}>Guardar cambio de rol</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            )}

            {/* Info message when can't manage */}
            {canManageRoles && !canChangeThisMember && !isSelf && (
              <View style={styles.infoBox}>
                <MaterialIcons name="info-outline" size={16} color="rgba(22,57,96,0.4)" />
                <Text style={styles.infoBoxText}>
                  No puedes modificar el rol de este miembro porque tiene un rol igual o superior al tuyo.
                </Text>
              </View>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>

          {/* Close button at bottom */}
          <Pressable
            style={[styles.closeModalBtn, { borderColor: BORDER }]}
            onPress={onClose}
          >
            <Text style={styles.closeModalBtnText}>Cerrar</Text>
          </Pressable>
        </View>
      </View>
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
  memberMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  memberPhone: { fontSize: 11, color: 'rgba(22,57,96,0.55)', fontFamily: FONT },
  regionBadge: { backgroundColor: '#E0F2FE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  regionBadgeText: { fontSize: 9, color: '#0369A1', fontFamily: FONT, textTransform: 'uppercase' },
  whatsappBtn: { padding: 8 },
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

  // Modal handle
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#E1E6F0',
    alignSelf: 'center', marginBottom: 16,
  },

  // Member profile header
  memberProfileHeader: { alignItems: 'center', gap: 8, paddingBottom: 20 },
  memberDetailAvatar: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
  },
  memberDetailName: { fontSize: 18, fontFamily: FONT, marginTop: 8 },
  memberRolePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  memberRolePillText: { fontSize: 11, fontFamily: FONT, textTransform: 'uppercase' },
  selfBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, marginTop: 2 },
  selfBadgeText: { fontSize: 10, fontFamily: FONT },

  // Contact section
  memberContactSection: {
    gap: 1, backgroundColor: '#F1F5F9', borderRadius: 12, overflow: 'hidden' as const, marginBottom: 12,
  },
  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF',
    paddingVertical: 12, paddingHorizontal: 14,
  },
  contactIconBox: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  contactLabel: { fontSize: 10, color: 'rgba(22,57,96,0.45)', fontFamily: FONT, textTransform: 'uppercase', letterSpacing: 0.3 },
  contactValue: { fontSize: 14, color: '#163960', fontFamily: FONT, marginTop: 1 },

  // WhatsApp full button
  whatsappFullBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#DCFCE7', paddingVertical: 14, borderRadius: 12, marginBottom: 4,
  },
  whatsappFullBtnText: { fontSize: 14, color: '#166534', fontFamily: FONT },

  // Role change section
  roleChangeSection: { marginTop: 16, gap: 10 },
  roleChangeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  roleChangeSectionTitle: {
    fontSize: 12, fontFamily: FONT, color: 'rgba(22,57,96,0.6)',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  roleOptions: { gap: 6 },
  roleOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#FFF',
  },
  roleOptionIcon: {
    width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  roleOptionText: { flex: 1, fontSize: 13, fontFamily: FONT, color: 'rgba(22,57,96,0.7)' },
  currentRoleTag: { fontSize: 10, fontFamily: FONT, textTransform: 'uppercase', opacity: 0.7 },
  saveRoleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: 12, marginTop: 6,
  },
  saveRoleBtnText: { fontSize: 14, color: '#FFF', fontFamily: FONT },

  // Info box
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16,
    backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#E1E6F0',
  },
  infoBoxText: { flex: 1, fontSize: 12, color: 'rgba(22,57,96,0.5)', fontFamily: FONT, lineHeight: 18 },

  // Close modal button
  closeModalBtn: {
    paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, marginTop: 8,
  },
  closeModalBtnText: { fontSize: 14, color: 'rgba(22,57,96,0.5)', fontFamily: FONT },
});

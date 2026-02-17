/**
 * Reuniones — Lista de meets de la campana activa.
 *
 * - Carga meets reales desde GET /api/meets/active
 * - Admin/supervisor pueden crear meets con FAB (+)
 * - Agentes pueden unirse/salir de meets
 * - Pull to refresh
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { useApp } from '@/lib/app-context';
import * as api from '@/lib/api';
import type { Meet } from '@/lib/types';

const FONT = 'Montserrat-Bold';
const BORDER = '#E1E6F0';

const STATUS_LABELS: Record<string, string> = {
  pending_location: 'Sin ubicacion',
  scheduled: 'Programado',
  active: 'Activo',
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const month = months[d.getMonth()]!;
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${day} ${month} · ${hours}:${mins}`;
}

export default function ReunionesScreen() {
  const { auth } = useApp();

  const [meets, setMeets] = useState<Meet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const fetchMeets = useCallback(async () => {
    const result = await api.getActiveMeets();
    if (result.ok) {
      setMeets(result.data.meets);
    }
  }, []);

  useEffect(() => {
    if (auth.status !== 'active') return;
    fetchMeets().finally(() => setLoading(false));
  }, [fetchMeets, auth.status]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMeets();
    setRefreshing(false);
  }, [fetchMeets]);

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
  }, [fetchMeets]);

  if (auth.status !== 'active') return null;

  const { candidate, agent, campaign } = auth.config;
  const primary = candidate.color_primario;
  const secondary = candidate.color_secundario;
  const canCreate = agent.role === 'admin' || agent.role === 'supervisor';

  const renderMeet = ({ item }: { item: Meet }) => (
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
        {item.participant_count != null && (
          <View style={styles.metaRow}>
            <MaterialIcons name="people" size={14} color="rgba(22,57,96,0.5)" />
            <Text style={styles.metaText}>{item.participant_count} participante{item.participant_count !== 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>

      {(item.status === 'scheduled' || item.status === 'active') && (
        <Pressable
          style={[styles.joinBtn, { backgroundColor: primary }]}
          onPress={() => handleJoin(item.id)}
        >
          <MaterialIcons name="login" size={16} color="#FFF" />
          <Text style={styles.joinBtnText}>Unirme</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.header, { backgroundColor: primary }]}>
        <Text style={styles.title}>Reuniones</Text>
        <Text style={styles.subtitle}>{candidate.name}</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={primary} />
        </View>
      ) : (
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
      )}

      {/* FAB — only for admin/supervisor */}
      {canCreate && (
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
    </SafeAreaView>
  );
}

// ─── Create Meet Modal ──────────────────────────────────────

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
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: primary }]}>Nueva reunion</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={24} color="rgba(22,57,96,0.5)" />
            </Pressable>
          </View>

          <View style={styles.modalBody}>
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
      </View>
    </Modal>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { padding: 20, paddingBottom: 16 },
  title: { fontSize: 24, color: '#FFFFFF', fontFamily: FONT },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontFamily: FONT, marginTop: 4 },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  list: { padding: 16, gap: 12, paddingBottom: 100 },

  // Empty
  emptyState: { padding: 40, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: FONT },
  emptyText: {
    fontSize: 13, color: 'rgba(22,57,96,0.6)', fontFamily: FONT, textAlign: 'center', lineHeight: 20,
  },

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

  joinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10, marginTop: 4,
  },
  joinBtnText: { fontSize: 13, color: '#FFF', fontFamily: FONT },

  // FAB
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 4,
  },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40, gap: 20,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontFamily: FONT },
  modalBody: { gap: 12 },
  inputLabel: { fontSize: 12, fontFamily: FONT, color: 'rgba(22,57,96,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: FONT, color: '#163960',
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  inputHint: { fontSize: 11, color: 'rgba(22,57,96,0.4)', fontFamily: FONT, fontStyle: 'italic' },
  saveBtn: {
    paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { fontSize: 15, color: '#FFF', fontFamily: FONT },
});

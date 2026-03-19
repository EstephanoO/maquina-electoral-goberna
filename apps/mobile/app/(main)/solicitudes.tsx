/**
 * Solicitudes Screen — Admin/Jefe de Campaña.
 * Shows pending access requests with role selection and approve/reject buttons.
 * Data from GET /api/access-requests/pending.
 * 
 * Features:
 * - Select role before approving (agente_campo, agente_digital, brigadista_zonal, candidato)
 * - Visual feedback with loading states
 * - Swipe to see more actions
 */

import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';

import { useApp } from '@/lib/app-context';
import * as api from '@/lib/api';
import type { AccessRequestRow } from '@/lib/types';

const FONT = 'Montserrat-Bold';
const BORDER = '#E1E6F0';

// ═══════════════════════════════════════════════════════════════
// ROLE CONFIGURATION
// ═══════════════════════════════════════════════════════════════

type RoleOption = {
  key: string;
  label: string;
  shortLabel: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  bgColor: string;
  description: string;
};

const ASSIGNABLE_ROLES: RoleOption[] = [
  {
    key: 'agente_campo',
    label: 'Agente de Campo',
    shortLabel: 'Ag. Campo',
    icon: 'person',
    color: '#059669',
    bgColor: '#D1FAE5',
    description: 'Operador territorial, sube formularios',
  },
  {
    key: 'agente_digital',
    label: 'Agente Digital',
    shortLabel: 'Ag. Digital',
    icon: 'computer',
    color: '#0891B2',
    bgColor: '#CFFAFE',
    description: 'Acceso al CMS web',
  },
  {
    key: 'brigadista_zonal',
    label: 'Brigadista Zonal',
    shortLabel: 'Brigadista',
    icon: 'map',
    color: '#D97706',
    bgColor: '#FEF3C7',
    description: 'Coordina agentes en su zona',
  },
  {
    key: 'candidato',
    label: 'Candidato',
    shortLabel: 'Candidato',
    icon: 'star',
    color: '#2563EB',
    bgColor: '#DBEAFE',
    description: 'Control total de la campaña',
  },
];

function getRoleConfig(roleKey: string): RoleOption {
  return ASSIGNABLE_ROLES.find(r => r.key === roleKey) ?? ASSIGNABLE_ROLES[0]!;
}

// ═══════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════

export default function SolicitudesScreen() {
  const { auth } = useApp();
  const config = auth.status === 'active' ? auth.config : null;
  const primary = config?.candidate.color_primario ?? '#163960';

  const [requests, setRequests] = useState<AccessRequestRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // Modal state for role selection
  const [selectedRequest, setSelectedRequest] = useState<AccessRequestRow | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('agente_campo');

  const loadRequests = useCallback(async () => {
    setError(null);
    const result = await api.getPendingAccessRequests();
    if (result.ok) {
      setRequests(result.data.pending_requests);
    } else {
      setError(result.error ?? 'Error al cargar solicitudes');
    }
    setLoading(false); // siempre resetear loading al final
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

  // Open role selection modal
  const handleApprovePress = (request: AccessRequestRow) => {
    setSelectedRequest(request);
    setSelectedRole('agente_campo'); // Default to agente
  };

  // Confirm approval with selected role
  const handleConfirmApproval = async () => {
    if (!selectedRequest) return;
    
    setProcessingId(selectedRequest.id);
    const result = await api.resolveAccessRequest(selectedRequest.id, { 
      status: 'approved',
      role: selectedRole,
    });
    
    if (result.ok) {
      setRequests((prev) => prev.filter((r) => r.id !== selectedRequest.id));
      setSelectedRequest(null);
    } else {
      Alert.alert('Error', result.error);
    }
    setProcessingId(null);
  };

  // Direct reject (no role needed)
  const handleReject = (request: AccessRequestRow) => {
    Alert.alert(
      'Rechazar solicitud',
      `¿Rechazar el acceso de ${request.full_name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: () => {
            // Envolver en función síncrona + manejo de errores correcto
            // Alert.alert no propaga errores de onPress async
            setProcessingId(request.id);
            api.resolveAccessRequest(request.id, { status: 'rejected' })
              .then((result) => {
                if (result.ok) {
                  setRequests((prev) => prev.filter((r) => r.id !== request.id));
                } else {
                  Alert.alert('Error al rechazar', result.error ?? 'Intenta de nuevo.');
                }
              })
              .catch(() => {
                Alert.alert('Error', 'Error de conexión. Intentá de nuevo.');
              })
              .finally(() => {
                setProcessingId(null);
              });
          },
        },
      ],
    );
  };

  // Early return if not active
  if (auth.status !== 'active' || !config) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.header, { backgroundColor: primary }]}>
        <Text style={styles.headerTitle}>Solicitudes de acceso</Text>
        {/* Ocultar conteo mientras carga para no mostrar "0 pendientes" incorrecto */}
        {!loading && (
          <Text style={styles.headerCount}>
            {requests.length} pendiente{requests.length !== 1 ? 's' : ''}
          </Text>
        )}
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />
        }
        renderItem={({ item }) => {
          const isProcessing = processingId === item.id;
          
          return (
            <View style={[styles.card, isProcessing && styles.cardProcessing]}>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{item.full_name}</Text>
                <View style={styles.cardMetaRow}>
                  {item.phone && (
                    <View style={styles.metaItem}>
                      <MaterialIcons name="phone" size={12} color="rgba(22,57,96,0.5)" />
                      <Text style={styles.metaText}>{item.phone}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.cardMetaRow}>
                  {item.region && (
                    <View style={styles.regionBadge}>
                      <MaterialIcons name="place" size={10} color="#0369A1" />
                      <Text style={styles.regionText}>{item.region}</Text>
                    </View>
                  )}
                  <Text style={styles.dateText}>
                    {new Date(item.created_at).toLocaleDateString('es-PE', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </Text>
                </View>
              </View>
              
              <View style={styles.cardActions}>
                {isProcessing ? (
                  <ActivityIndicator size="small" color={primary} />
                ) : (
                  <>
                    <Pressable
                      style={[styles.actionBtn, styles.approveBtn]}
                      onPress={() => handleApprovePress(item)}
                    >
                      <MaterialIcons name="check" size={20} color="#16A34A" />
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.rejectBtn]}
                      onPress={() => handleReject(item)}
                    >
                      <MaterialIcons name="close" size={20} color="#DC2626" />
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {loading ? (
              <ActivityIndicator size="large" color={primary} />
            ) : error ? (
              <>
                <MaterialIcons name="error-outline" size={48} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
                <Pressable style={[styles.retryBtn, { backgroundColor: primary }]} onPress={() => { setLoading(true); void loadRequests(); }}>
                  <Text style={styles.retryText}>Reintentar</Text>
                </Pressable>
              </>
            ) : (
              <>
                <MaterialIcons name="check-circle" size={48} color="#22C55E" />
                <Text style={styles.emptyTitle}>¡Todo al día!</Text>
                <Text style={styles.emptyText}>No hay solicitudes pendientes</Text>
              </>
            )}
          </View>
        }
      />

      {/* Role Selection Modal */}
      <RoleSelectionModal
        visible={!!selectedRequest}
        request={selectedRequest}
        selectedRole={selectedRole}
        onSelectRole={setSelectedRole}
        onConfirm={handleConfirmApproval}
        onCancel={() => setSelectedRequest(null)}
        processing={processingId === selectedRequest?.id}
        primary={primary}
      />
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROLE SELECTION MODAL
// ═══════════════════════════════════════════════════════════════

function RoleSelectionModal({
  visible,
  request,
  selectedRole,
  onSelectRole,
  onConfirm,
  onCancel,
  processing,
  primary,
}: {
  visible: boolean;
  request: AccessRequestRow | null;
  selectedRole: string;
  onSelectRole: (role: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  processing: boolean;
  primary: string;
}) {
  // Mantener el último request para que la animación de slide-out
  // pueda renderizar contenido mientras el Modal se cierra.
  const lastRequestRef = useRef<AccessRequestRow | null>(null);
  if (request) lastRequestRef.current = request;
  const displayRequest = request ?? lastRequestRef.current;

  if (!displayRequest) return null;

  return (
    // visible={!!request}: cuando request=null el Modal anima su cierre antes de desmontar
    <Modal visible={!!request} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalDismiss} onPress={onCancel} />
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: primary }]}>Aprobar solicitud</Text>
            <Pressable onPress={onCancel} hitSlop={12}>
              <MaterialIcons name="close" size={24} color="rgba(22,57,96,0.5)" />
            </Pressable>
          </View>

          {/* User info */}
          <View style={styles.userInfoSection}>
            <View style={[styles.userAvatar, { backgroundColor: primary + '15' }]}>
              <Text style={[styles.userInitial, { color: primary }]}>
                {displayRequest.full_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.userName}>{displayRequest.full_name}</Text>
            {displayRequest.phone && <Text style={styles.userPhone}>{displayRequest.phone}</Text>}
            {displayRequest.region && (
              <View style={styles.userRegionBadge}>
                <MaterialIcons name="place" size={12} color="#0369A1" />
                <Text style={styles.userRegionText}>{displayRequest.region}</Text>
              </View>
            )}
          </View>

          {/* Role selection */}
          <Text style={styles.sectionLabel}>Asignar como:</Text>
          <View style={styles.roleOptions}>
            {ASSIGNABLE_ROLES.map((role) => {
              const isSelected = selectedRole === role.key;
              return (
                <Pressable
                  key={role.key}
                  style={[
                    styles.roleOption,
                    isSelected && { borderColor: role.color, backgroundColor: role.bgColor },
                  ]}
                  onPress={() => onSelectRole(role.key)}
                >
                  <View style={[styles.roleIcon, { backgroundColor: role.bgColor }]}>
                    <MaterialIcons name={role.icon} size={20} color={role.color} />
                  </View>
                  <View style={styles.roleInfo}>
                    <Text style={[styles.roleLabel, isSelected && { color: role.color }]}>
                      {role.label}
                    </Text>
                    <Text style={styles.roleDescription}>{role.description}</Text>
                  </View>
                  {isSelected && (
                    <MaterialIcons name="check-circle" size={20} color={role.color} />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Confirm button */}
          <Pressable
            style={[styles.confirmBtn, { backgroundColor: primary }, processing && { opacity: 0.6 }]}
            onPress={onConfirm}
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <MaterialIcons name="person-add" size={18} color="#FFF" />
                <Text style={styles.confirmBtnText}>
                  Aprobar como {getRoleConfig(selectedRole).shortLabel}
                </Text>
              </>
            )}
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
  header: { padding: 20, gap: 4 },
  headerTitle: { fontSize: 20, color: '#FFFFFF', fontFamily: FONT },
  headerCount: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: FONT },
  content: { padding: 16, paddingBottom: 40 },

  // Card
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
  cardProcessing: {
    opacity: 0.5,
  },
  cardInfo: { flex: 1, gap: 4 },
  cardName: { fontSize: 15, color: '#163960', fontFamily: FONT },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: 'rgba(22,57,96,0.6)', fontFamily: FONT },
  regionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  regionText: { fontSize: 10, color: '#0369A1', fontFamily: FONT, textTransform: 'uppercase' },
  dateText: { fontSize: 11, color: 'rgba(22,57,96,0.4)', fontFamily: FONT },

  // Actions
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    // 48dp: mínimo recomendado por Material Design para targets táctiles en campo
    // Los 40dp anteriores eran muy chicos para dedos sucios o en movimiento
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtn: { backgroundColor: '#DCFCE7' },
  rejectBtn: { backgroundColor: '#FEE2E2' },

  // Empty state
  emptyState: { padding: 48, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 18, color: '#163960', fontFamily: FONT },
  emptyText: { fontSize: 14, color: 'rgba(22,57,96,0.6)', fontFamily: FONT, textAlign: 'center' },
  errorText: { fontSize: 14, color: '#DC2626', fontFamily: FONT, textAlign: 'center' },
  retryBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20, marginTop: 8 },
  retryText: { fontSize: 13, color: '#FFFFFF', fontFamily: FONT },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalDismiss: { flex: 1 },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontFamily: FONT },

  // User info section
  userInfoSection: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInitial: { fontSize: 22, fontFamily: FONT },
  userName: { fontSize: 16, fontFamily: FONT, color: '#163960' },
  userPhone: { fontSize: 13, color: 'rgba(22,57,96,0.6)', fontFamily: FONT },
  userRegionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  userRegionText: { fontSize: 11, color: '#0369A1', fontFamily: FONT, textTransform: 'uppercase' },

  // Role selection
  sectionLabel: {
    fontSize: 11,
    fontFamily: FONT,
    color: 'rgba(22,57,96,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  roleOptions: { gap: 10 },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: BORDER,
    backgroundColor: '#FFF',
  },
  roleIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleInfo: { flex: 1, gap: 2 },
  roleLabel: { fontSize: 14, fontFamily: FONT, color: '#163960' },
  roleDescription: { fontSize: 11, color: 'rgba(22,57,96,0.5)', fontFamily: FONT },

  // Confirm button
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  confirmBtnText: { fontSize: 15, color: '#FFF', fontFamily: FONT },
});

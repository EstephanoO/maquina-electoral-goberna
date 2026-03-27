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
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { useCandidate, useAgent, useApp, useActiveCampaign } from '@/lib/app-context';

// ── WA Contact Helper ────────────────────────────────────────────────
function buildValidationWaLink(
  telefono: string,
  agentName: string,
  candidateName: string,
  waTarget: string
): string {
  const firstName  = agentName.split(' ')[0] ?? agentName;
  const rawPhone   = telefono.replace(/\D/g, '');
  const contactNum = rawPhone.length === 9 ? '51' + rawPhone : rawPhone;
  // Opens WA chat with the contact's number with a pre-loaded message
  const msg = encodeURIComponent(
    `Hola, soy ${firstName} de la campaña de ${candidateName}. ` +
    `Por favor comunícate al número de campaña: ${waTarget} para más información. ¡Gracias!`
  );
  return `https://wa.me/${contactNum}?text=${msg}`;
}
import { useAgentTracking } from '@/hooks/useAgentTracking';
import { getQueueStats, getLocalFormsByCampaign, getSyncedClientIds, markFormsAsGhost, deleteLocalForm, type PendingForm } from '@/lib/offline-queue';
import { getMySubmissionStats, getMyClientIds } from '@/lib/api';
import { appEvents } from '@/lib/events';
import type { CampaignMembership } from '@/lib/types';

const FONT = 'Montserrat-Bold';

// Base URL para fotos de candidatos. Se lee del mismo config que la API.
// Así si el proyecto Vercel cambia de nombre solo hay que actualizar app.json.
import Constants from 'expo-constants';
const _apiBase: string = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_API_URL ?? 'https://api.goberna.us/api';
// La URL de fotos es el origen del API sin el path /api
const PHOTO_BASE_URL = _apiBase.replace(/\/api$/, '');

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
  stats: { total: number; synced: number; pending: number; rejected: number };
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

// ─── Form Status Config ─────────────────────────────────────────

type FormStatus = 'synced' | 'pending' | 'syncing' | 'failed' | 'rejected' | 'ghost';

interface StatusConfig {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  description: string;
  bgColor: string;
  fgColor: string;
  badgeBg: string;
  iconBg: string;
  tappable: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const STATUS_MAP: Record<FormStatus, StatusConfig> = {
  synced: {
    icon: 'cloud-done',
    label: 'Sincronizado',
    description: 'Registro guardado en el servidor.',
    bgColor: '#ffffff',
    fgColor: '#16a34a',
    badgeBg: '#dcfce7',
    iconBg: '#f0fdf4',
    tappable: true,   // tappable to open WA contact action
    canEdit: false,
    canDelete: false,
  },
  pending: {
    icon: 'cloud-upload',
    label: 'Pendiente',
    description: 'Esperando conexion para sincronizar.',
    bgColor: '#ffffff',
    fgColor: '#d97706',
    badgeBg: '#fef3c7',
    iconBg: '#fffbeb',
    tappable: false,
    canEdit: false,
    canDelete: false,
  },
  syncing: {
    icon: 'cloud-upload',
    label: 'Sincronizando',
    description: 'Enviando al servidor...',
    bgColor: '#ffffff',
    fgColor: '#d97706',
    badgeBg: '#fef3c7',
    iconBg: '#fffbeb',
    tappable: false,
    canEdit: false,
    canDelete: false,
  },
  ghost: {
    icon: 'sync-problem',
    label: 'Reintentando',
    description: 'El servidor no confirmo este registro. Se reintentara automaticamente.',
    bgColor: '#fff7ed',
    fgColor: '#c2410c',
    badgeBg: '#ffedd5',
    iconBg: '#fed7aa',
    tappable: true,
    canEdit: false,
    canDelete: true,
  },
  failed: {
    icon: 'error-outline',
    label: 'Error',
    description: 'No se pudo sincronizar con el servidor.',
    bgColor: '#fef2f2',
    fgColor: '#dc2626',
    badgeBg: '#fee2e2',
    iconBg: '#fecaca',
    tappable: true,
    canEdit: true,
    canDelete: true,
  },
  rejected: {
    icon: 'cancel',
    label: 'Rechazado',
    description: 'El servidor no acepto este registro.',
    bgColor: '#fef2f2',
    fgColor: '#dc2626',
    badgeBg: '#fee2e2',
    iconBg: '#fecaca',
    tappable: true,
    canEdit: true,
    canDelete: true,
  },
};

// ─── Form Action Sheet (bottom sheet overlay) ──────────────────

interface ActionSheetProps {
  form: PendingForm | null;
  onClose: () => void;
  onEdit: (form: PendingForm) => void;
  onDelete: (form: PendingForm) => void;
  primaryColor: string;
  agentName: string;
  candidateName: string;
  waTarget: string;
}

const FormActionSheet = memo(function FormActionSheet({
  form,
  onClose,
  onEdit,
  onDelete,
  primaryColor,
  agentName,
  candidateName,
  waTarget,
}: ActionSheetProps) {
  // Mantener el último form en un ref para que la animación de salida
  // pueda renderizar el contenido mientras el Modal se cierra.
  // El guard "if (!form) return null" mataba la animación exiting.
  const lastFormRef = useRef<PendingForm | null>(null);
  if (form) lastFormRef.current = form;
  const displayForm = form ?? lastFormRef.current;

  if (!displayForm) return null;

  const status = STATUS_MAP[displayForm.sync_status as FormStatus] ?? STATUS_MAP.failed;

  let data: { nombre?: string; telefono?: string } = {};
  try { data = JSON.parse(displayForm.payload); } catch { /* ignore */ }

  const detailMessage = displayForm.sync_status === 'rejected'
    ? (displayForm.reject_reason || status.description)
    : displayForm.sync_status === 'failed'
    ? (displayForm.last_error || status.description)
    : status.description;

  const handleDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Eliminar registro',
      `Se eliminara "${data.nombre || 'Sin nombre'}" de la lista. Esta accion no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => { onDelete(displayForm); onClose(); },
        },
      ],
    );
  };

  const handleEdit = () => {
    onEdit(displayForm);
    onClose();
  };

  // ── Open WA with pre-loaded validation message ──────────────
  const handleWriteWA = () => {
    const tel = data.telefono ?? '';
    if (!tel) {
      Alert.alert('Sin teléfono', 'Este registro no tiene número de teléfono.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const url = buildValidationWaLink(tel, agentName, candidateName, waTarget);
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'No se pudo abrir WhatsApp. Verificá que esté instalado.');
    });
    onClose();
  };

  return (
    // visible={!!form}: cuando form se vuelve null, Modal sigue montado brevemente
    // para permitir que SlideOutDown se ejecute antes del unmount
    <Modal visible={!!form} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={sheetStyles.backdropFill} />
      </Pressable>
      <Animated.View
        entering={SlideInDown.springify().damping(20).stiffness(200)}
        exiting={SlideOutDown.duration(200)}
        style={sheetStyles.sheet}
      >
        {/* Drag handle */}
        <View style={sheetStyles.handleBar}>
          <View style={sheetStyles.handle} />
        </View>

        {/* Status header */}
        <View style={sheetStyles.header}>
          <View style={[sheetStyles.statusIcon, { backgroundColor: status.iconBg }]}>
            <MaterialIcons name={status.icon} size={24} color={status.fgColor} />
          </View>
          <View style={sheetStyles.headerText}>
            <Text style={[sheetStyles.headerTitle, { color: status.fgColor }]}>
              {status.label}
            </Text>
            <Text style={sheetStyles.headerName} numberOfLines={1}>
              {data.nombre || 'Sin nombre'}
              {data.telefono ? ` \u00B7 ${data.telefono}` : ''}
            </Text>
          </View>
        </View>

        {/* Detail message */}
        <View style={[sheetStyles.messageCard, { backgroundColor: status.badgeBg }]}>
          <MaterialIcons name="info-outline" size={16} color={status.fgColor} />
          <Text style={[sheetStyles.messageText, { color: status.fgColor }]}>
            {detailMessage}
          </Text>
        </View>

        {/* Actions */}
        <View style={sheetStyles.actions}>
          {/* WA button — always available when there's a phone number */}
          {!!data.telefono && (
            <Pressable
              style={[sheetStyles.actionBtn, sheetStyles.actionBtnWa]}
              onPress={handleWriteWA}
              android_ripple={{ color: 'rgba(37,211,102,0.15)' }}
              accessibilityLabel="Escribir por WhatsApp"
            >
              <MaterialIcons name="chat" size={18} color="#16a34a" />
              <Text style={sheetStyles.actionBtnTextWa}>
                Escribirle por WhatsApp
              </Text>
            </Pressable>
          )}
          {status.canEdit && (
            <Pressable
              style={[sheetStyles.actionBtn, { backgroundColor: primaryColor }]}
              onPress={handleEdit}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            >
              <MaterialIcons name="edit" size={18} color="#fff" />
              <Text style={sheetStyles.actionBtnTextPrimary}>Editar y reenviar</Text>
            </Pressable>
          )}
          {status.canDelete && (
            <Pressable
              style={[sheetStyles.actionBtn, sheetStyles.actionBtnDestructive]}
              onPress={handleDelete}
              android_ripple={{ color: 'rgba(220,38,38,0.1)' }}
            >
              <MaterialIcons name="delete-outline" size={18} color="#dc2626" />
              <Text style={sheetStyles.actionBtnTextDestructive}>Eliminar registro</Text>
            </Pressable>
          )}
          <Pressable
            style={[sheetStyles.actionBtn, sheetStyles.actionBtnCancel]}
            onPress={onClose}
            android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
          >
            <Text style={sheetStyles.actionBtnTextCancel}>Cerrar</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
});

const sheetStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 34, // safe area
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 16,
    elevation: 16,
  },
  handleBar: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: FONT,
  },
  headerName: {
    fontSize: 13,
    fontFamily: FONT,
    color: '#64748b',
    marginTop: 2,
  },
  messageCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT,
    lineHeight: 20,
  },
  actions: {
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  actionBtnDestructive: {
    backgroundColor: '#fef2f2',
  },
  actionBtnCancel: {
    backgroundColor: '#f1f5f9',
  },
  actionBtnWa: {
    backgroundColor: '#dcfce7',
  },
  actionBtnTextPrimary: {
    fontSize: 15,
    fontFamily: FONT,
    color: '#ffffff',
  },
  actionBtnTextDestructive: {
    fontSize: 15,
    fontFamily: FONT,
    color: '#dc2626',
  },
  actionBtnTextCancel: {
    fontSize: 15,
    fontFamily: FONT,
    color: '#64748b',
  },
  actionBtnTextWa: {
    fontSize: 15,
    fontFamily: FONT,
    color: '#16a34a',
  },
});

// ─── Form Item Component ────────────────────────────────────────
// Material Design 3 aligned: 48dp min touch target, semantic colors,
// icon + text status indicators (not color alone), proper hierarchy.

interface LocalFormData {
  nombre?: string;
  telefono?: string;
  fecha?: string;
}

const FormItem = memo(function FormItem({
  form,
  primaryColor,
  onPress,
}: {
  form: PendingForm;
  primaryColor: string;
  onPress: (form: PendingForm) => void;
}) {
  let data: LocalFormData = {};
  try {
    data = JSON.parse(form.payload);
  } catch {
    // ignore
  }

  const status = STATUS_MAP[form.sync_status as FormStatus] ?? STATUS_MAP.pending;

  // Format time
  const formDate = data.fecha ? new Date(data.fecha) : new Date(form.created_at);
  const timeStr = formDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  const handlePress = () => {
    if (status.tappable) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress(form);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={!status.tappable}
      style={({ pressed }) => [
        fItemStyles.container,
        { backgroundColor: status.bgColor },
        pressed && status.tappable && { opacity: 0.7 },
      ]}
      android_ripple={status.tappable ? { color: `${status.fgColor}15` } : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${data.nombre || 'Sin nombre'}, ${data.telefono || 'sin telefono'}, ${status.label}`}
      accessibilityHint={status.tappable ? 'Toca para ver opciones' : undefined}
    >
      {/* Status icon — Material 3: don't convey info by color alone */}
      <View style={[fItemStyles.iconContainer, { backgroundColor: status.iconBg }]}>
        <MaterialIcons name={status.icon} size={20} color={status.fgColor} />
      </View>

      {/* Content */}
      <View style={fItemStyles.content}>
        <View style={fItemStyles.topRow}>
          <Text style={fItemStyles.name} numberOfLines={1}>
            {data.nombre || 'Sin nombre'}
          </Text>
          <Text style={fItemStyles.time}>{timeStr}</Text>
        </View>
        <View style={fItemStyles.bottomRow}>
          <Text style={fItemStyles.phone}>{data.telefono || '---'}</Text>
          {/* Status badge */}
          <View style={[fItemStyles.badge, { backgroundColor: status.badgeBg }]}>
            <View style={[fItemStyles.badgeDot, { backgroundColor: status.fgColor }]} />
            <Text style={[fItemStyles.badgeText, { color: status.fgColor }]}>
              {status.label}
            </Text>
          </View>
        </View>
      </View>

      {/* Chevron for tappable items */}
      {status.tappable && (
        <MaterialIcons name="chevron-right" size={20} color="#94a3b8" style={fItemStyles.chevron} />
      )}
    </Pressable>
  );
});

const fItemStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 12,
    minHeight: 64, // well above 48dp touch target
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 15,
    fontFamily: FONT,
    color: '#1e293b',
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: FONT,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  phone: {
    fontSize: 13,
    color: '#64748b',
    fontFamily: FONT,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: FONT,
    letterSpacing: 0.3,
  },
  chevron: {
    marginLeft: 4,
  },
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

  // Build photo URL once
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
        getLocalFormsByCampaign(campaign.id, 200),
        getMySubmissionStats(),
        getMyClientIds(),
      ]);

      // ── Reconciliation: detect ghost forms ──────────────────────────
      // Forms marked "synced" locally but not confirmed by the server
      // were silently dropped by the write-behind queue (dedup/failure).
      // Mark them as "ghost" so they get re-submitted by the sync service.
      if (clientIdsResult.ok && clientIdsResult.data) {
        const serverSet = new Set(clientIdsResult.data.client_ids);
        const localSynced = await getSyncedClientIds(campaign.id);
        const ghostIds = localSynced
          .filter((f) => !serverSet.has(f.client_id))
          .map((f) => f.id);
        if (ghostIds.length > 0) {
          await markFormsAsGhost(ghostIds);
        }
      }

      // Re-fetch after reconciliation may have changed statuses
      const [updatedQueueStats, updatedForms] = await Promise.all([
        getQueueStats(),
        getLocalFormsByCampaign(campaign.id, 200),
      ]);

      const formsPending = (updatedQueueStats.forms?.pending ?? 0) + (updatedQueueStats.forms?.ghost ?? 0);
      const formsRejected = updatedQueueStats.forms?.rejected ?? 0;
      // Server total is the source of truth — includes all synced submissions ever sent,
      // even those already cleaned up from local SQLite (>7 days old).
      // Uses phone dedup (DISTINCT ON telefono) consistent with Pipeline/web dashboard.
      //
      // IMPORTANT: When serverStats.ok === true, ALWAYS trust the server count (even if 0).
      // The local SQLite "synced" count is unreliable because the write-behind queue
      // returns 202 (accepted) before persisting — forms may be deduped or lost downstream.
      // Only fall back to SQLite counts when the API call fails (offline scenario).
      const serverOk = serverStats.ok === true;
      const serverTotal = serverOk ? (serverStats.data?.stats.total ?? 0) : 0;
      const newStats = {
        total: serverOk ? serverTotal + formsPending : formsPending + (updatedQueueStats.forms?.synced ?? 0),
        synced: serverOk ? serverTotal : (updatedQueueStats.forms?.synced ?? 0),
        pending: formsPending,
        rejected: formsRejected,
      };

      // Only update stats if values changed
      const prev = prevStatsRef.current;
      if (prev.total !== newStats.total || prev.synced !== newStats.synced || prev.pending !== newStats.pending || prev.rejected !== newStats.rejected) {
        prevStatsRef.current = newStats;
        setStats(newStats);
      }

      // Only update forms list if contents changed (compare by ids + sync_status)
      const prevForms = prevFormsRef.current;
      const changed =
        updatedForms.length !== prevForms.length ||
        updatedForms.some((f, i) => f.client_id !== prevForms[i]?.client_id || f.sync_status !== prevForms[i]?.sync_status);
      if (changed) {
        prevFormsRef.current = updatedForms;
        setLocalForms(updatedForms);
      }

    } catch (err) {
      console.warn('Failed to load data:', err);
    } finally {
      setInitialLoading(false);
    }
  }, [campaign.id]);

  // Reload when tab gains focus (coming back from new-form, other tabs, etc.)
  useFocusEffect(
    useCallback(() => {
      void loadData();
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

  const handleFormPress = useCallback((form: PendingForm) => {
    setSelectedForm(form);
  }, []);

  const handleEditForm = useCallback((form: PendingForm) => {
    // Navigate to new-form with pre-filled data from the rejected/failed form
    try {
      const payload = JSON.parse(form.payload);
      router.push({
        pathname: '/(main)/new-form',
        params: { prefill: JSON.stringify(payload) },
      });
    } catch {
      router.push('/(main)/new-form');
    }
  }, [router]);

  const handleDeleteForm = useCallback(async (form: PendingForm) => {
    await deleteLocalForm(form.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await loadData();
  }, [loadData]);

  const renderItem = useCallback(({ item }: { item: PendingForm }) => (
    <FormItem form={item} primaryColor={primary} onPress={handleFormPress} />
  ), [primary, handleFormPress]);

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

  const renderEmpty = useCallback(() => {
    // No mostrar "Sin registros" mientras está cargando el primer batch
    if (initialLoading) {
      return (
        <View style={styles.emptyState}>
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

      {/* GPS Permission Banner — shown when permission not yet granted.
          The requestPermission() call happens HERE, inside a user onPress,
          so the iOS system dialog is triggered by a direct user action.
          This satisfies Apple guideline 5.1.1. */}
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

      {/* QR FAB — bottom-left */}
      <Pressable
        style={[styles.qrFab, { backgroundColor: primary }]}
        onPress={() => router.push('/(main)/qr-code')}
      >
        <MaterialIcons name="qr-code-2" size={26} color="#ffffff" />
      </Pressable>

      {/* FAB — bottom-right */}
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

      {/* Form Action Sheet — replaces Alert.alert with proper bottom sheet */}
      <FormActionSheet
        form={selectedForm}
        onClose={() => setSelectedForm(null)}
        onEdit={handleEditForm}
        onDelete={handleDeleteForm}
        primaryColor={primary}
        agentName={agent.full_name}
        candidateName={candidate.name}
        waTarget={(campaign as Record<string, unknown>).whatsapp_number as string ?? '51999999999'}
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

  // (Form item styles are in fItemStyles StyleSheet above)

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

  // QR FAB (bottom-left)
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
  // FAB (bottom-right)
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

  // GPS Permission Banner
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
    fontFamily: FONT,
  },
  permissionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  permissionButtonText: {
    fontSize: 13,
    color: '#fff',
    fontFamily: FONT,
  },
});

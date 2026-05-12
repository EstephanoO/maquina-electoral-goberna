/**
 * FormActionSheet — Bottom sheet con acciones sobre un registro.
 */
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { memo, useRef } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { FontFamily } from '@/constants/theme';
import type { PendingForm } from '@/lib/offline-queue';

import { buildValidationWaLink, STATUS_MAP, type FormStatus } from './shared';

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

export const FormActionSheet = memo(function FormActionSheet({
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
    <Modal visible={!!form} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.backdropFill} />
      </Pressable>
      <Animated.View
        entering={SlideInDown.springify().damping(20).stiffness(200)}
        exiting={SlideOutDown.duration(200)}
        style={styles.sheet}
      >
        <View style={styles.handleBar}>
          <View style={styles.handle} />
        </View>

        <View style={styles.header}>
          <View style={[styles.statusIcon, { backgroundColor: status.iconBg }]}>
            <MaterialIcons name={status.icon} size={24} color={status.fgColor} />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.headerTitle, { color: status.fgColor }]}>
              {status.label}
            </Text>
            <Text style={styles.headerName} numberOfLines={1}>
              {data.nombre || 'Sin nombre'}
              {data.telefono ? ` · ${data.telefono}` : ''}
            </Text>
          </View>
        </View>

        <View style={[styles.messageCard, { backgroundColor: status.badgeBg }]}>
          <MaterialIcons name="info-outline" size={16} color={status.fgColor} />
          <Text style={[styles.messageText, { color: status.fgColor }]}>
            {detailMessage}
          </Text>
        </View>

        <View style={styles.actions}>
          {!!data.telefono && (
            <Pressable
              style={[styles.actionBtn, styles.actionBtnWa]}
              onPress={handleWriteWA}
              android_ripple={{ color: 'rgba(37,211,102,0.15)' }}
              accessibilityLabel="Escribir por WhatsApp"
            >
              <MaterialIcons name="chat" size={18} color="#16a34a" />
              <Text style={styles.actionBtnTextWa}>
                Escribirle por WhatsApp
              </Text>
            </Pressable>
          )}
          {status.canEdit && (
            <Pressable
              style={[styles.actionBtn, { backgroundColor: primaryColor }]}
              onPress={handleEdit}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            >
              <MaterialIcons name="edit" size={18} color="#fff" />
              <Text style={styles.actionBtnTextPrimary}>Editar y reenviar</Text>
            </Pressable>
          )}
          {status.canDelete && (
            <Pressable
              style={[styles.actionBtn, styles.actionBtnDestructive]}
              onPress={handleDelete}
              android_ripple={{ color: 'rgba(220,38,38,0.1)' }}
            >
              <MaterialIcons name="delete-outline" size={18} color="#dc2626" />
              <Text style={styles.actionBtnTextDestructive}>Eliminar registro</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.actionBtn, styles.actionBtnCancel]}
            onPress={onClose}
            android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
          >
            <Text style={styles.actionBtnTextCancel}>Cerrar</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
});

const styles = StyleSheet.create({
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
    paddingBottom: 34,
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
    fontFamily: FontFamily.bold,
  },
  headerName: {
    fontSize: 13,
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.bold,
    color: '#ffffff',
  },
  actionBtnTextDestructive: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
    color: '#dc2626',
  },
  actionBtnTextCancel: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
    color: '#64748b',
  },
  actionBtnTextWa: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
    color: '#16a34a',
  },
});

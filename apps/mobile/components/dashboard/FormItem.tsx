/**
 * FormItem — Item de lista en el dashboard.
 * Material Design 3: 48dp min touch target, icono + texto (no solo color).
 */
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontFamily } from '@/constants/theme';
import type { PendingForm } from '@/lib/offline-queue';

import { STATUS_MAP, type FormStatus, type LocalFormData } from './shared';

export const FormItem = memo(function FormItem({
  form,
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
        styles.container,
        { backgroundColor: status.bgColor },
        pressed && status.tappable && { opacity: 0.7 },
      ]}
      android_ripple={status.tappable ? { color: `${status.fgColor}15` } : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${data.nombre || 'Sin nombre'}, ${data.telefono || 'sin telefono'}, ${status.label}`}
      accessibilityHint={status.tappable ? 'Toca para ver opciones' : undefined}
    >
      <View style={[styles.iconContainer, { backgroundColor: status.iconBg }]}>
        <MaterialIcons name={status.icon} size={20} color={status.fgColor} />
      </View>

      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>
            {data.nombre || 'Sin nombre'}
          </Text>
          <Text style={styles.time}>{timeStr}</Text>
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.phone}>{data.telefono || '---'}</Text>
          <View style={[styles.badge, { backgroundColor: status.badgeBg }]}>
            <View style={[styles.badgeDot, { backgroundColor: status.fgColor }]} />
            <Text style={[styles.badgeText, { color: status.fgColor }]}>{status.label}</Text>
          </View>
        </View>
      </View>

      {status.tappable && (
        <MaterialIcons name="chevron-right" size={20} color="#94a3b8" style={styles.chevron} />
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 12,
    minHeight: 64,
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
    fontFamily: FontFamily.bold,
    color: '#1e293b',
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.bold,
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
    fontFamily: FontFamily.bold,
    letterSpacing: 0.3,
  },
  chevron: {
    marginLeft: 4,
  },
});

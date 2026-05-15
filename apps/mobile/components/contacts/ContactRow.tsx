// apps/mobile/components/contacts/ContactRow.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontFamily, Neutral } from '@/constants/theme';
import type { Contact } from '@/lib/offline-queue/contacts';
import { ESTADO_META } from '@/lib/contact-estados';

type Props = { contact: Contact };

export const ContactRow = memo(function ContactRow({ contact }: Props) {
  const router = useRouter();
  const meta = ESTADO_META[contact.estado];

  return (
    <Pressable
      onPress={() => router.push(`/(main)/contact/${contact.id}` as never)}
      style={({ pressed }) => [styles.container, pressed && styles.containerPressed]}
      android_ripple={{ color: 'rgba(22,57,96,0.08)' }}
      accessibilityRole="button"
      accessibilityLabel={`${contact.name}, ${contact.distrito_nombre ?? 'Sin distrito'}, ${meta.label}`}
    >
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>
            {contact.name}
          </Text>
          {contact.reminder_at != null && (
            <Ionicons name="notifications-outline" size={16} color={Neutral.textMuted} style={styles.bell} />
          )}
        </View>
        <Text style={styles.distrito} numberOfLines={1}>
          {contact.distrito_nombre ?? 'Sin distrito'}
        </Text>
      </View>

      <View style={[styles.estadoBadge, { backgroundColor: meta.color + '20' }]}>
        <Text style={[styles.estadoLabel, { color: meta.color }]}>{meta.label}</Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={Neutral.textMuted} style={styles.chevron} />
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
    backgroundColor: '#ffffff',
    minHeight: 64,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  containerPressed: {
    opacity: 0.75,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontFamily: FontFamily.bold,
    color: '#1e293b',
    flex: 1,
  },
  bell: {
    marginLeft: 2,
  },
  distrito: {
    fontSize: 13,
    color: Neutral.textSecondary,
    fontFamily: FontFamily.regular,
    marginTop: 3,
  },
  estadoBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginHorizontal: 8,
  },
  estadoLabel: {
    fontSize: 11,
    fontFamily: FontFamily.bold,
  },
  chevron: {
    marginLeft: 2,
  },
});

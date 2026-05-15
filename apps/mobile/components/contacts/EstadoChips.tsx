// apps/mobile/components/contacts/EstadoChips.tsx
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { ContactEstado } from '@/lib/offline-queue/contacts';
import { ESTADO_META, ESTADO_ORDER } from '@/lib/contact-estados';

type Props = { value: ContactEstado | null; onChange: (v: ContactEstado | null) => void };

export default function EstadoChips({ value, onChange }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Pressable onPress={() => onChange(null)}
        style={[styles.chip, value === null && styles.chipActive]}>
        <Text style={[styles.label, value === null && styles.labelActive]}>Todos</Text>
      </Pressable>
      {ESTADO_ORDER.map((e) => (
        <Pressable key={e} onPress={() => onChange(e)}
          style={[styles.chip, value === e && { backgroundColor: ESTADO_META[e].color }]}>
          <Text style={[styles.label, value === e && styles.labelActive]}>
            {ESTADO_META[e].emoji} {ESTADO_META[e].label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
          backgroundColor: '#f1f5f9' },
  chipActive: { backgroundColor: '#163960' },
  label: { fontSize: 13, color: '#475569' },
  labelActive: { color: '#fff', fontWeight: '600' },
});

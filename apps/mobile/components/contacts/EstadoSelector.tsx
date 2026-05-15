import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ESTADO_META, ESTADO_ORDER } from '@/lib/contact-estados';
import type { ContactEstado } from '@/lib/offline-queue/contacts';

type Props = {
  value: ContactEstado;
  onChange: (e: ContactEstado) => void;
};

export default function EstadoSelector({ value, onChange }: Props) {
  return (
    <View style={styles.grid}>
      {ESTADO_ORDER.map((e) => {
        const meta = ESTADO_META[e];
        const isSelected = e === value;
        return (
          <Pressable
            key={e}
            style={[
              styles.btn,
              isSelected
                ? { backgroundColor: meta.color }
                : styles.btnUnselected,
            ]}
            onPress={() => onChange(e)}
            accessibilityRole="button"
            accessibilityLabel={meta.label}
            accessibilityState={{ selected: isSelected }}
          >
            <Text style={styles.emoji}>{meta.emoji}</Text>
            <Text
              style={[
                styles.label,
                isSelected ? styles.labelSelected : styles.labelUnselected,
              ]}
            >
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  btn: {
    width: '47%',
    minHeight: 72,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  btnUnselected: {
    backgroundColor: '#F1F5F9',
  },
  emoji: {
    fontSize: 22,
  },
  label: {
    fontSize: 15,
    fontFamily: 'Montserrat-Bold',
  },
  labelSelected: {
    color: '#FFFFFF',
  },
  labelUnselected: {
    color: '#163960',
  },
});

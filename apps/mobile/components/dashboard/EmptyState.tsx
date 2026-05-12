/**
 * Dashboard EmptyState — Placeholder cuando no hay form submissions.
 */
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FontFamily, Neutral } from '@/constants/theme';

export const EmptyState = memo(function EmptyState({
  primaryColor,
}: {
  primaryColor: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>📋</Text>
      <Text style={[styles.emptyTitle, { color: primaryColor }]}>Sin registros</Text>
      <Text style={styles.emptySubtitle}>Toca + para agregar</Text>
    </View>
  );
});

const styles = StyleSheet.create({
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
    fontFamily: FontFamily.bold,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Neutral.textMuted,
    fontFamily: FontFamily.bold,
    marginTop: 4,
  },
});

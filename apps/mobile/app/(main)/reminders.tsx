/**
 * Reminders screen — lists contacts with a scheduled follow-up reminder.
 * Groups contacts into "Hoy", "Próximos 7 días", "Más adelante".
 * Tapping a row navigates to the contact detail screen.
 */

import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { listWithReminders, type Contact } from '@/lib/offline-queue/contacts';
import { Brand, FontFamily, Spacing } from '@/constants/theme';

type Group = { title: string; data: Contact[] };
type FlatItem =
  | { type: 'header'; title: string }
  | { type: 'row'; contact: Contact };

function groupByDate(contacts: Contact[]): Group[] {
  const now = Date.now();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const weekEnd = new Date(now + 7 * 24 * 3600 * 1000);

  const hoy: Contact[] = [];
  const proximos: Contact[] = [];
  const masAdel: Contact[] = [];

  for (const c of contacts) {
    if (c.reminder_at === null) continue;
    if (c.reminder_at <= todayEnd.getTime()) hoy.push(c);
    else if (c.reminder_at <= weekEnd.getTime()) proximos.push(c);
    else masAdel.push(c);
  }

  const groups: Group[] = [];
  if (hoy.length) groups.push({ title: 'Hoy', data: hoy });
  if (proximos.length) groups.push({ title: 'Próximos 7 días', data: proximos });
  if (masAdel.length) groups.push({ title: 'Más adelante', data: masAdel });
  return groups;
}

export default function RemindersScreen() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [total, setTotal] = useState(0);

  useFocusEffect(
    useCallback(() => {
      listWithReminders().then((contacts) => {
        setTotal(contacts.length);
        setGroups(groupByDate(contacts));
      });
    }, []),
  );

  if (total === 0) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Text style={styles.header}>Follow-ups</Text>
        <View style={styles.empty}>
          <MaterialIcons name="notifications-none" size={48} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyText}>Sin recordatorios programados</Text>
          <Text style={styles.emptyHint}>Agrega un recordatorio al editar un contacto</Text>
        </View>
      </SafeAreaView>
    );
  }

  const items: FlatItem[] = [];
  for (const g of groups) {
    items.push({ type: 'header', title: g.title });
    for (const c of g.data) items.push({ type: 'row', contact: c });
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Text style={styles.header}>Follow-ups</Text>
      <FlatList
        data={items}
        keyExtractor={(item) =>
          item.type === 'header' ? item.title : item.contact.id
        }
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return <Text style={styles.groupTitle}>{item.title}</Text>;
          }
          const { contact } = item;
          const date = contact.reminder_at
            ? new Date(contact.reminder_at).toLocaleDateString('es-PE', {
                day: '2-digit',
                month: 'short',
              })
            : '';
          return (
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/(main)/contact/${contact.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Ver contacto ${contact.name}, recordatorio ${date}`}
            >
              <MaterialIcons name="notifications-active" size={20} color={Brand.yellow} />
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{contact.name}</Text>
                <Text style={styles.rowDate}>{date}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.3)" />
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const FONT = FontFamily.bold;
const FONT_REGULAR = FontFamily.regular;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Brand.blue },
  header: {
    color: '#fff',
    fontSize: 22,
    fontFamily: FONT,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  groupTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  rowText: { flex: 1 },
  rowName: { color: '#fff', fontSize: 15, fontFamily: FONT },
  rowDate: { color: Brand.yellow, fontSize: 12, fontFamily: FONT_REGULAR, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontFamily: FONT_REGULAR },
  emptyHint: { color: 'rgba(255,255,255,0.3)', fontSize: 13, fontFamily: FONT_REGULAR },
});

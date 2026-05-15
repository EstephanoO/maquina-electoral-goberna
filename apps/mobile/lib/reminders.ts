import * as Notifications from 'expo-notifications';

export type ReminderBucket = { label: string; days: number };

export const reminderBuckets: ReminderBucket[] = [
  { label: 'Mañana', days: 1 },
  { label: 'En 3 días', days: 3 },
  { label: 'En 1 semana', days: 7 },
  { label: 'En 2 semanas', days: 14 },
  { label: 'En 1 mes', days: 30 },
];

export async function scheduleReminder(
  contactId: string,
  contactName: string,
  daysFromNow: number,
): Promise<string> {
  await Notifications.requestPermissionsAsync();
  const triggerDate = new Date();
  triggerDate.setDate(triggerDate.getDate() + daysFromNow);
  triggerDate.setHours(9, 0, 0, 0); // 9 AM local

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Seguimiento de contacto',
      body: `Recordatorio: visitar a ${contactName}`,
      data: { contactId },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
  });
}

export async function cancelReminder(notifId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notifId);
}

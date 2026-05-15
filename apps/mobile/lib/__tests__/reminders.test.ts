import { describe, it, expect, mock } from 'bun:test';

// Mock expo-notifications BEFORE dynamic import — bun requires this order
// because static imports are hoisted; dynamic import() respects mock registration.
mock.module('expo-notifications', () => ({
  requestPermissionsAsync: mock(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: mock(async () => 'test-notif-id-123'),
  cancelScheduledNotificationAsync: mock(async () => undefined),
  setNotificationHandler: mock(() => {}),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

// Dynamic import ensures the mock is active when reminders.ts loads expo-notifications
const { reminderBuckets, scheduleReminder, cancelReminder } = await import('../reminders');

describe('reminders', () => {
  it('reminderBuckets has at least 3 items', () => {
    expect(reminderBuckets.length).toBeGreaterThanOrEqual(3);
    expect(reminderBuckets[0]).toHaveProperty('label');
    expect(reminderBuckets[0]).toHaveProperty('days');
  });

  it('scheduleReminder returns a notif id string', async () => {
    const id = await scheduleReminder('contact-1', 'Ana Pérez', 7);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('cancelReminder resolves without throwing', async () => {
    await expect(cancelReminder('test-notif-id-123')).resolves.toBeUndefined();
  });
});

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'test-notif-id-123'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

import { reminderBuckets, scheduleReminder, cancelReminder } from '../reminders';

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

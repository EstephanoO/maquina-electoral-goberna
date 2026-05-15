// apps/mobile/app/(main)/contact/__tests__/contact-detail.test.tsx
import { render, waitFor } from '@testing-library/react-native';
import { createContact } from '@/lib/offline-queue/contacts';
import ContactDetail from '../[id]';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: (globalThis as any).__testContactId }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'notif-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));

test('renders the contact name from SQLite', async () => {
  const c = await createContact({ name: 'Carlos Mendoza', estado: 'apoya' });
  (globalThis as any).__testContactId = c.id;
  const { getByText } = render(<ContactDetail />);
  await waitFor(() => getByText('Carlos Mendoza'));
});

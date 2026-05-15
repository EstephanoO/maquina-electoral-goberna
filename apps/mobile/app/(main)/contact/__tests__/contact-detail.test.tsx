// apps/mobile/app/(main)/contact/__tests__/contact-detail.test.tsx
import { render, waitFor } from '@testing-library/react-native';
import { createContact } from '@/lib/offline-queue/contacts';
import ContactDetail from '../[id]';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: (globalThis as any).__testContactId }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

test('renders the contact name from SQLite', async () => {
  const c = await createContact({ name: 'Carlos Mendoza', estado: 'apoya' });
  (globalThis as any).__testContactId = c.id;
  const { getByText } = render(<ContactDetail />);
  await waitFor(() => getByText('Carlos Mendoza'));
});

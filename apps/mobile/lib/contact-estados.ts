import type { ContactEstado } from './offline-queue/contacts';

export const ESTADO_META: Record<ContactEstado, { label: string; color: string; emoji: string }> = {
  apoya:   { label: 'Apoya',    color: '#16a34a', emoji: '🟢' },
  duda:    { label: 'Duda',     color: '#d97706', emoji: '🟡' },
  no:      { label: 'No',       color: '#dc2626', emoji: '🔴' },
  no_esta: { label: 'No está',  color: '#2563eb', emoji: '🔵' },
};

export const ESTADO_ORDER: ContactEstado[] = ['apoya', 'duda', 'no', 'no_esta'];

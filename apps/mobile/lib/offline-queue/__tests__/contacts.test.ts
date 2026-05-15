import { closeDatabase, getDatabase } from '../db';
import {
  createContact, getContact, updateContact, softDeleteContact,
  listContacts, searchContacts, listWithReminders, wipeAllContacts,
} from '../contacts';

beforeEach(async () => {
  const db = await getDatabase();
  await db.execAsync('DELETE FROM contacts;');
});
afterEach(async () => { await closeDatabase(); });

test('createContact persists and returns a contact with defaults', async () => {
  const c = await createContact({ name: 'Ana Torres' });
  expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(c.name).toBe('Ana Torres');
  expect(c.estado).toBe('duda');
  expect(c.sync_status).toBe('local');
  expect(c.deleted_at).toBeNull();
  const fetched = await getContact(c.id);
  expect(fetched?.name).toBe('Ana Torres');
});

test('updateContact changes fields and bumps updated_at', async () => {
  const c = await createContact({ name: 'Ana' });
  await new Promise((r) => setTimeout(r, 5));
  const u = await updateContact(c.id, { estado: 'apoya', note: 'voto seguro' });
  expect(u.estado).toBe('apoya');
  expect(u.note).toBe('voto seguro');
  expect(u.updated_at).toBeGreaterThan(c.updated_at);
});

test('softDeleteContact sets deleted_at; list excludes it', async () => {
  const c = await createContact({ name: 'Ana' });
  await softDeleteContact(c.id);
  const fetched = await getContact(c.id);
  expect(fetched?.deleted_at).not.toBeNull();
  const all = await listContacts();
  expect(all.find((x) => x.id === c.id)).toBeUndefined();
});

test('listContacts filters by estado', async () => {
  await createContact({ name: 'A', estado: 'apoya' });
  await createContact({ name: 'B', estado: 'no' });
  const apoya = await listContacts({ estado: 'apoya' });
  expect(apoya).toHaveLength(1);
  expect(apoya[0].name).toBe('A');
});

test('searchContacts matches name and phone', async () => {
  await createContact({ name: 'Ana Torres', phone: '987654321' });
  await createContact({ name: 'Beto Ruiz', phone: '912345678' });
  expect((await searchContacts('torres'))).toHaveLength(1);
  expect((await searchContacts('91234'))).toHaveLength(1);
});

test('listWithReminders returns only future-or-past reminders, sorted', async () => {
  await createContact({ name: 'Sin reminder' });
  await createContact({ name: 'Con reminder', reminder_at: Date.now() + 86400000 });
  const r = await listWithReminders();
  expect(r).toHaveLength(1);
  expect(r[0].name).toBe('Con reminder');
});

test('wipeAllContacts removes all rows', async () => {
  await createContact({ name: 'A' });
  await createContact({ name: 'B' });
  await wipeAllContacts();
  expect(await listContacts()).toHaveLength(0);
});

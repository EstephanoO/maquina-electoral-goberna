import { getDatabase, closeDatabase } from '../db';

afterEach(async () => { await closeDatabase(); });

test('contacts table exists with canonical columns', async () => {
  const db = await getDatabase();
  const cols = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(contacts)"
  );
  const names = cols.map((c) => c.name).sort();
  expect(names).toEqual([
    'agent_id', 'campaign_id', 'created_at', 'deleted_at', 'distrito_nombre',
    'estado', 'id', 'lat', 'lng', 'name', 'note', 'phone', 'photo_uri',
    'reminder_at', 'reminder_notif_id', 'server_id', 'sync_status',
    'ubigeo', 'updated_at',
  ]);
});

test('contacts indexes exist', async () => {
  const db = await getDatabase();
  const idx = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='contacts'"
  );
  const names = idx.map((i) => i.name);
  expect(names).toEqual(expect.arrayContaining([
    'idx_contacts_estado', 'idx_contacts_updated',
    'idx_contacts_ubigeo', 'idx_contacts_sync',
  ]));
});

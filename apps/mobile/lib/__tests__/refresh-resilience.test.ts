import { refreshTokens, setRefreshToken } from '../auth-store';

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

beforeEach(async () => { await setRefreshToken('seeded-refresh-token'); });

test('5xx from refresh endpoint returns transient (does not clear)', async () => {
  global.fetch = (async () => new Response('', { status: 503 })) as typeof fetch;
  const result = await refreshTokens('https://api.test/api');
  expect(result).toBe('transient');
});

test('401 from refresh endpoint returns expired', async () => {
  global.fetch = (async () => new Response('', { status: 401 })) as typeof fetch;
  const result = await refreshTokens('https://api.test/api');
  expect(result).toBe('expired');
});

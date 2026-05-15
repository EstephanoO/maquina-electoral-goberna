import { test, expect, vi } from 'vitest';

// whatsapp-otp imports redisClient at module level, which triggers getEnv() and
// requires DATABASE_URL + JWT_SECRET. Mock the infra module so the unit test
// can run without a real environment.
vi.mock('../../../infra/redis', () => ({
  redisClient: {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    ttl: vi.fn(),
  },
}));

import { isDemoPhone } from '../whatsapp-otp';

test('isDemoPhone matches the configured demo phone, normalized', () => {
  expect(isDemoPhone('999000001', '999000001')).toBe(true);
  expect(isDemoPhone('+51 999 000 001', '999000001')).toBe(true);
  expect(isDemoPhone('987654321', '999000001')).toBe(false);
  expect(isDemoPhone('999000001', '')).toBe(false);
});

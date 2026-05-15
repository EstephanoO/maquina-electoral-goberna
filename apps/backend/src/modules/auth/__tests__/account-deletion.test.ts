import { test, expect, vi } from 'vitest';

// repository.ts imports pool from ../../db which calls getEnv() at module
// level. Mock both infra modules so this pure-function test runs without
// a real DB or Redis environment.
vi.mock('../../../db', () => ({
  pool: {},
  db: {},
  getOnboardingPool: vi.fn(),
  isOnboardingEnabled: vi.fn(() => false),
}));

vi.mock('../../../infra/redis', () => ({
  redisClient: {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    ttl: vi.fn(),
  },
}));

import { buildDeleteAccountSql } from '../repository';

test('buildDeleteAccountSql produces statements in FK-safe order', () => {
  const stmts = buildDeleteAccountSql();
  const idxUsers = stmts.findIndex((s) => /DELETE FROM users\b/.test(s));
  const idxUC = stmts.findIndex((s) => /user_campaigns/.test(s));
  const idxRT = stmts.findIndex((s) => /refresh_tokens/.test(s));
  expect(idxUC).toBeLessThan(idxUsers);
  expect(idxRT).toBeLessThan(idxUsers);
  expect(idxUsers).toBe(stmts.length - 1);
});

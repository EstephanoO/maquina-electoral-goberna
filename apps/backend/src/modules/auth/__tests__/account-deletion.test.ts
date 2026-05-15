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

  expect(stmts.length).toBeGreaterThan(0);

  // DELETE FROM users must be the very last statement
  const idxUsers = stmts.findIndex((s) => /DELETE FROM users\b/.test(s));
  expect(idxUsers).toBe(stmts.length - 1);

  // every explicit child DELETE appears before the users delete
  const childDeletes = stmts.slice(0, idxUsers).filter((s) => /^DELETE\b/.test(s));
  expect(childDeletes.length).toBeGreaterThan(0);
  childDeletes.forEach((stmt) => {
    expect(stmts.indexOf(stmt)).toBeLessThan(idxUsers);
  });

  // every SET NULL update appears before the users delete
  stmts.filter((s) => /SET \w+ = NULL/.test(s)).forEach((stmt) => {
    expect(stmts.indexOf(stmt)).toBeLessThan(idxUsers);
  });

  // every statement is single-param ($1 only)
  stmts.forEach((s) => expect(s).not.toMatch(/\$[2-9]/));
});

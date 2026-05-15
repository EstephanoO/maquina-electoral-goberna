/**
 * Mock for bun:test — maps to Jest globals so test files that import from
 * 'bun:test' can run under the jest-expo test runner without modification.
 *
 * Functions that have no Jest equivalent (mock.module) are no-ops.
 */
const { expect, describe, it, test, beforeEach, afterEach, beforeAll, afterAll } = global;

const mock = Object.assign(
  function mock(fn) {
    return jest.fn(fn);
  },
  {
    module: () => {}, // no-op: jest.mock() hoisting handles this separately
    restore: () => {},
  },
);

module.exports = {
  expect,
  describe,
  it,
  test,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  mock,
};

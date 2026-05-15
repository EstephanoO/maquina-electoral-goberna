/**
 * Manual Jest mock for expo-secure-store.
 *
 * expo-secure-store relies on a native module (Keychain) unavailable in
 * Jest/Node. This mock provides an in-memory Map that survives per test file
 * but resets between test runs, which is enough for unit tests that only
 * need auth-store calls to not throw.
 */

const _store = new Map();

module.exports = {
  getItemAsync: jest.fn(async (key) => _store.get(key) ?? null),
  setItemAsync: jest.fn(async (key, value) => { _store.set(key, value); }),
  deleteItemAsync: jest.fn(async (key) => { _store.delete(key); }),
};

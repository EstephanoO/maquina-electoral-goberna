/**
 * Manual Jest mock for expo-crypto.
 *
 * expo-crypto relies on a native module (ExpoCrypto) which is unavailable in
 * Jest/Node. This mock provides the same named export used by contacts.ts —
 * randomUUID() — backed by Node's built-in crypto module (available since
 * Node 14.17), so tests run without any native Expo environment.
 */

const { randomUUID } = require('crypto');

module.exports = { randomUUID };

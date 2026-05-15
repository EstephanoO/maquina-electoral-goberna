/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  moduleNameMapper: {
    // Use the manual mock for expo-sqlite so tests run without native modules
    '^expo-sqlite$': '<rootDir>/__mocks__/expo-sqlite.js',
    // Use the manual mock for expo-crypto so randomUUID works in Node/Jest
    '^expo-crypto$': '<rootDir>/__mocks__/expo-crypto.js',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base))',
    '/node_modules/react-native-reanimated/plugin/',
  ],
};

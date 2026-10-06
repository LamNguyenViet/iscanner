module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.js'],
  testTimeout: 15000,
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '__tests__/fixtures'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|pdf-lib|@pdf-lib|react-native-draggable-flatlist|react-native-pdf|react-native-document-scanner-plugin)',
  ],
};

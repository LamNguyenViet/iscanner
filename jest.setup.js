// Official react-native-gesture-handler mocks (native module, buttons, Pressable).
require('react-native-gesture-handler/jestSetup');

// The real lazy logger singleton would start flush timers and touch expo-file-system.
// Suites assert calls via jest.requireMock('.../src/logging/logger').log; createLogger etc. stay real.
jest.mock('./src/logging/logger', () => ({
  ...jest.requireActual('./src/logging/logger'),
  log: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
    init: jest.fn().mockResolvedValue(undefined),
  },
}));

// The Expo native module behind the Word decryptor does not exist under Jest; tests that decrypt override this.
jest.mock('./modules/office-crypto', () => ({
  __esModule: true,
  default: { iteratedHash: jest.fn() },
}));

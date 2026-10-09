let mockBuild: string | null = '7';
let mockVersion: string | null = '1.7.0';
jest.mock('expo-application', () => ({
  get nativeBuildVersion() {
    return mockBuild;
  },
  get nativeApplicationVersion() {
    return mockVersion;
  },
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '9.9.9' } } }));

import { currentAppBuild } from '../../src/native/appBuild';

test('reads version and build', () => {
  mockBuild = '7';
  mockVersion = '1.7.0';
  expect(currentAppBuild()).toEqual({ version: '1.7.0', build: 7 });
});

test('null or garbage build gives 0, version falls back to expo config', () => {
  mockBuild = null;
  mockVersion = null;
  expect(currentAppBuild()).toEqual({ version: '9.9.9', build: 0 });
  mockBuild = 'abc';
  mockVersion = '1.0.0';
  expect(currentAppBuild()).toEqual({ version: '1.0.0', build: 0 });
});

import { readFileSync } from 'fs';
import { join } from 'path';

test('expo-localization plugin keeps vi/en and live Android locale changes', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8'));
  const entry = app.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-localization');
  expect(entry[1]).toMatchObject({
    supportedLocales: { ios: ['vi', 'en'], android: ['vi', 'en'] },
    allowDynamicLocaleChangesAndroid: true,
  });
});

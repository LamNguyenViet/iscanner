import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { LocaleProvider, useLocale } from '../../src/i18n/LocaleContext';
import { createMemoryFs } from '../../src/library/memoryFs';
import { SETTINGS_PATH } from '../../src/settings/settings';

let mockLocales: { languageCode: string | null; languageTag: string }[] = [];
jest.mock('expo-localization', () => ({ useLocales: () => mockLocales }));

let setPref: (p: 'system' | 'vi' | 'en') => void = () => {};
function Probe() {
  const { t, language, preference, setPreference } = useLocale();
  setPref = setPreference;
  return <Text testID="out">{`${t.settings.title}|${language}|${preference}`}</Text>;
}
const out = () => screen.getByTestId('out').props.children;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  mockLocales = [{ languageCode: 'en', languageTag: 'en-US' }];
});

test('device en with empty fs', async () => {
  await render(<LocaleProvider fs={createMemoryFs()}><Probe /></LocaleProvider>);
  await settle();
  expect(out()).toBe('Settings|en|system');
});

test('device vi-VN', async () => {
  mockLocales = [{ languageCode: 'vi', languageTag: 'vi-VN' }];
  await render(<LocaleProvider fs={createMemoryFs()}><Probe /></LocaleProvider>);
  await settle();
  expect(out()).toBe('Cài đặt|vi|system');
});

test('saved en wins on a vi device', async () => {
  mockLocales = [{ languageCode: 'vi', languageTag: 'vi-VN' }];
  const fs = createMemoryFs();
  await fs.writeText(SETTINGS_PATH, '{"language":"en"}');
  await render(<LocaleProvider fs={fs}><Probe /></LocaleProvider>);
  await settle();
  expect(out()).toBe('Settings|en|en');
});

test('setPreference updates immediately and keeps theme in the file', async () => {
  const fs = createMemoryFs();
  await fs.writeText(SETTINGS_PATH, '{"theme":"dark"}');
  await render(<LocaleProvider fs={fs}><Probe /></LocaleProvider>);
  await settle();
  await act(async () => setPref('vi'));
  expect(out()).toBe('Cài đặt|vi|vi');
  await settle();
  expect(JSON.parse((await fs.readText(SETTINGS_PATH))!)).toMatchObject({ theme: 'dark', language: 'vi' });
});

test('a failed save keeps the choice', async () => {
  const fs = createMemoryFs();
  fs.failNextWrite(SETTINGS_PATH);
  await render(<LocaleProvider fs={fs}><Probe /></LocaleProvider>);
  await settle();
  await act(async () => setPref('vi'));
  await settle();
  expect(out()).toBe('Cài đặt|vi|vi');
});

test('system follows a device locale change', async () => {
  const fs = createMemoryFs();
  await render(<LocaleProvider fs={fs}><Probe /></LocaleProvider>);
  await settle();
  expect(out()).toBe('Settings|en|system');
  mockLocales = [{ languageCode: 'vi', languageTag: 'vi-VN' }];
  await screen.rerender(<LocaleProvider fs={fs}><Probe /></LocaleProvider>);
  expect(out()).toBe('Cài đặt|vi|system');
});

test('no provider', async () => {
  await render(<Probe />);
  expect(out()).toBe('Cài đặt|vi|system');
});

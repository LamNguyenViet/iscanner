import { Appearance } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Settings from '../../app/settings';
import { LocaleProvider } from '../../src/i18n/LocaleContext';
import { createMemoryFs } from '../../src/library/memoryFs';
import { SETTINGS_PATH } from '../../src/settings/settings';
import { ThemeProvider } from '../../src/theme/ThemeContext';

jest.mock('expo-localization', () => ({
  useLocales: () => [{ languageCode: 'vi', languageTag: 'vi-VN' }],
}));

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let fs: ReturnType<typeof createMemoryFs>;
let setScheme: jest.SpyInstance;
beforeEach(async () => {
  fs = createMemoryFs();
  setScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
  await render(
    <ThemeProvider fs={fs}>
      <LocaleProvider fs={fs}>
        <Settings />
      </LocaleProvider>
    </ThemeProvider>,
  );
  await settle();
});
afterEach(() => jest.restoreAllMocks());

test('shows both groups with the system choice marked', () => {
  expect(screen.getByText('Giao diện')).toBeTruthy();
  expect(screen.getByText('Ngôn ngữ')).toBeTruthy();
  expect(screen.getAllByText('✓ Theo hệ thống')).toHaveLength(2);
  expect(screen.getByText('Sáng')).toBeTruthy();
  expect(screen.getByText('Tối')).toBeTruthy();
  expect(screen.getByText('Tiếng Việt')).toBeTruthy();
  expect(screen.getByText('English')).toBeTruthy();
});

test('choosing a theme applies it and moves the mark', async () => {
  await fireEvent.press(screen.getByText('Tối'));
  await settle();
  expect(setScheme).toHaveBeenLastCalledWith('dark');
  expect(screen.getByText('✓ Tối')).toBeTruthy();
  expect(screen.getAllByText('✓ Theo hệ thống')).toHaveLength(1);
});

test('choosing English switches the screen and keeps both settings', async () => {
  await fireEvent.press(screen.getByText('Tối'));
  await settle();
  await fireEvent.press(screen.getByText('English'));
  await settle();
  expect(screen.getByText('Appearance')).toBeTruthy();
  expect(screen.getByText('Language')).toBeTruthy();
  expect(screen.getByText('✓ English')).toBeTruthy();
  expect(JSON.parse(fs.files.get(SETTINGS_PATH) as string)).toEqual({ theme: 'dark', language: 'en' });
});

test('the chosen row is selected for accessibility', async () => {
  await fireEvent.press(screen.getByText('Sáng'));
  await settle();
  expect(screen.getByRole('button', { name: '✓ Sáng' })).toBeSelected();
  expect(screen.getByRole('button', { name: 'Tối' })).not.toBeSelected();
});

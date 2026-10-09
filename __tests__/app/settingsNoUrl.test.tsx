import { Alert, Platform } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Settings from '../../app/settings';
import { LocaleProvider } from '../../src/i18n/LocaleContext';
import { createMemoryFs } from '../../src/library/memoryFs';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { UpdateProvider } from '../../src/update/UpdateContext';

jest.mock('../../src/native/appBuild', () => ({
  currentAppBuild: () => ({ version: '1.7.0', build: 7 }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('expo-localization', () => ({
  useLocales: () => [{ languageCode: 'vi', languageTag: 'vi-VN' }],
}));

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

afterEach(() => jest.restoreAllMocks());

test('checking with no update config url reports a failed check, not up to date', async () => {
  // Android path: the sheet runs its follow-up right after closing (iOS waits for onDismiss).
  jest.replaceProperty(Platform, 'OS', 'android');
  const fs = createMemoryFs();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(
    <ThemeProvider fs={fs}>
      <LocaleProvider fs={fs}>
        <UpdateProvider deps={{ fs, configUrl: '', getBuild: () => ({ version: '1.7.0', build: 7 }) }}>
          <Settings />
        </UpdateProvider>
      </LocaleProvider>
    </ThemeProvider>,
  );
  await settle();
  await fireEvent.press(screen.getByRole('button', { name: /^Cập nhật/ }));
  await settle();
  await fireEvent.press(screen.getByText('Kiểm tra cập nhật'));
  await settle();
  expect(alert).toHaveBeenCalledWith('Không kiểm tra được cập nhật. Vui lòng thử lại khi có mạng.');
  expect(alert).not.toHaveBeenCalledWith('Bạn đang dùng phiên bản mới nhất.');
});

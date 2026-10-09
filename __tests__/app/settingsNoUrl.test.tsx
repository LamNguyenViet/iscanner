import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Settings from '../../app/settings';
import { LocaleProvider } from '../../src/i18n/LocaleContext';
import { createMemoryFs } from '../../src/library/memoryFs';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { UpdateProvider } from '../../src/update/UpdateContext';

jest.mock('../../src/native/appBuild', () => ({
  currentAppBuild: () => ({ version: '1.7.0', build: 7 }),
}));
jest.mock('expo-localization', () => ({
  useLocales: () => [{ languageCode: 'vi', languageTag: 'vi-VN' }],
}));

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

afterEach(() => jest.restoreAllMocks());

test('checking with no update config url reports a failed check, not up to date', async () => {
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
  await fireEvent.press(screen.getByText('Kiểm tra cập nhật'));
  await settle();
  expect(alert).toHaveBeenCalledWith('Không kiểm tra được cập nhật. Vui lòng thử lại khi có mạng.');
  expect(alert).not.toHaveBeenCalledWith('Bạn đang dùng phiên bản mới nhất.');
});

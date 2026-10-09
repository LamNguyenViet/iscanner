import { Alert, Appearance } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Settings from '../../app/settings';
import { LocaleProvider } from '../../src/i18n/LocaleContext';
import { createMemoryFs } from '../../src/library/memoryFs';
import { SETTINGS_PATH } from '../../src/settings/settings';
import { ShareError } from '../../src/errors/AppError';
import { exportLogs } from '../../src/logging/exportLogs';
import { shareLogFile } from '../../src/native/shareLogs';
import { ThemeProvider } from '../../src/theme/ThemeContext';
import { log } from '../../src/logging/logger';

jest.mock('../../src/logging/exportLogs', () => ({ exportLogs: jest.fn() }));
jest.mock('../../src/native/shareLogs', () => ({
  writeLogExport: jest.fn(),
  shareLogFile: jest.fn(),
}));
jest.mock('../../src/native/appBuild', () => ({
  currentAppBuild: () => ({ version: '1.7.0', build: 7 }),
}));
let mockCheckNow = jest.fn();
jest.mock('../../src/update/UpdateContext', () => ({
  useUpdate: () => ({ checkNow: (...a: unknown[]) => mockCheckNow(...a) }),
}));
const mockExport = exportLogs as jest.Mock;
const mockShare = shareLogFile as jest.Mock;

jest.mock('expo-localization', () => ({
  useLocales: () => [{ languageCode: 'vi', languageTag: 'vi-VN' }],
}));

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let fs: ReturnType<typeof createMemoryFs>;
let setScheme: jest.SpyInstance;
beforeEach(async () => {
  mockExport.mockReset();
  mockShare.mockReset().mockResolvedValue(undefined);
  mockCheckNow = jest.fn().mockResolvedValue('none');
  (log.info as jest.Mock).mockClear();
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

test('shows the support group with the send logs row', () => {
  expect(screen.getByText('Hỗ trợ')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Gửi log lỗi' })).toBeTruthy();
});

test('shows the support group in English', async () => {
  await fireEvent.press(screen.getByText('English'));
  await settle();
  expect(screen.getByText('Support')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Send error logs' })).toBeTruthy();
});

test('sending logs shares the export and logs it', async () => {
  mockExport.mockResolvedValue({ uri: 'file:///cache/l.txt', files: 2, bytes: 99 });
  await fireEvent.press(screen.getByText('Gửi log lỗi'));
  await settle();
  expect(mockShare).toHaveBeenCalledWith('file:///cache/l.txt');
  expect(log.info).toHaveBeenCalledWith('logs.exported', { files: 2, bytes: 99 });
});

test('with no logs an alert says so and nothing is shared', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockExport.mockResolvedValue(null);
  await fireEvent.press(screen.getByText('Gửi log lỗi'));
  await settle();
  expect(alert).toHaveBeenCalledWith('Chưa có log nào.');
  expect(mockShare).not.toHaveBeenCalled();
});

test('a share failure shows the SHARE error popup', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockExport.mockResolvedValue({ uri: 'file:///cache/l.txt', files: 1, bytes: 5 });
  mockShare.mockRejectedValue(new ShareError());
  await fireEvent.press(screen.getByText('Gửi log lỗi'));
  await settle();
  expect(alert).toHaveBeenCalledTimes(1);
  expect(String(alert.mock.calls[0][1])).toContain('SHARE');
  expect(log.info).not.toHaveBeenCalledWith('logs.exported', expect.anything());
});

test('the row is disabled while working', async () => {
  let release: (v: null) => void = () => {};
  mockExport.mockReturnValue(new Promise((r) => { release = r; }));
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let pressed: Promise<unknown> = Promise.resolve();
  await act(async () => { pressed = fireEvent.press(screen.getByText('Gửi log lỗi')); });
  expect(screen.getByRole('button', { name: 'Gửi log lỗi' })).toBeDisabled();
  await act(async () => { release(null); await pressed; });
  await settle();
  expect(screen.getByRole('button', { name: 'Gửi log lỗi' })).toBeEnabled();
});

test('shows the version line and the check for updates row', () => {
  expect(screen.getByText('Phiên bản 1.7.0 (7)')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Kiểm tra cập nhật' })).toBeTruthy();
});

test('the version line and row are English under English', async () => {
  await fireEvent.press(screen.getByText('English'));
  await settle();
  expect(screen.getByText('Version 1.7.0 (7)')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Check for updates' })).toBeTruthy();
});

test('checking with nothing newer says up to date', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await fireEvent.press(screen.getByText('Kiểm tra cập nhật'));
  await settle();
  expect(mockCheckNow).toHaveBeenCalledTimes(1);
  expect(alert).toHaveBeenCalledWith('Bạn đang dùng phiên bản mới nhất.');
});

test('a failed check says so', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockCheckNow.mockResolvedValue('failed');
  await fireEvent.press(screen.getByText('Kiểm tra cập nhật'));
  await settle();
  expect(alert).toHaveBeenCalledWith('Không kiểm tra được cập nhật. Vui lòng thử lại khi có mạng.');
});

test.each(['optional', 'force'])('a %s update is left to the gate', async (kind) => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockCheckNow.mockResolvedValue(kind);
  await fireEvent.press(screen.getByText('Kiểm tra cập nhật'));
  await settle();
  expect(alert).not.toHaveBeenCalled();
});

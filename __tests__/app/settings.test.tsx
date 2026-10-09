import { Alert, Appearance, Platform } from 'react-native';
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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('expo-localization', () => ({
  useLocales: () => [{ languageCode: 'vi', languageTag: 'vi-VN' }],
}));

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let fs: ReturnType<typeof createMemoryFs>;
let setScheme: jest.SpyInstance;
beforeEach(async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
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

const row = (title: RegExp) => screen.getByRole('button', { name: title });
const openSheet = async (title: RegExp) => {
  await fireEvent.press(row(title));
  await settle();
};

test('shows the general and support rows with their current values', () => {
  expect(screen.getByText('Chung')).toBeTruthy();
  expect(screen.getByText('Hỗ trợ')).toBeTruthy();
  expect(row(/^Giao diện/)).toHaveTextContent(/Giao diện\s*Theo hệ thống/);
  expect(row(/^Ngôn ngữ/)).toHaveTextContent(/Ngôn ngữ\s*Theo hệ thống/);
  expect(row(/^Cập nhật/)).toHaveTextContent(/Cập nhật\s*1\.7\.0 \(7\)/);
  expect(row(/^Log lỗi/)).toBeTruthy();
  // Choices live in the sheets, which start closed.
  expect(screen.queryByText('✓ Theo hệ thống')).toBeNull();
  expect(screen.queryByText('Tối')).toBeNull();
});

test('the appearance sheet marks the current choice; picking one applies it and closes', async () => {
  await openSheet(/^Giao diện/);
  expect(screen.getByText('✓ Theo hệ thống')).toBeTruthy();
  expect(screen.getByText('Sáng')).toBeTruthy();
  await fireEvent.press(screen.getByText('Tối'));
  await settle();
  expect(setScheme).toHaveBeenLastCalledWith('dark');
  expect(screen.queryByText('Sáng')).toBeNull();
  expect(row(/^Giao diện/)).toHaveTextContent(/Tối/);
});

test('the chosen option is selected for accessibility', async () => {
  await openSheet(/^Giao diện/);
  expect(screen.getByRole('button', { name: 'Theo hệ thống' })).toBeSelected();
  expect(screen.getByText('✓ Theo hệ thống')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Tối' })).not.toBeSelected();
});

test('choosing English switches the screen and keeps both settings', async () => {
  await openSheet(/^Giao diện/);
  await fireEvent.press(screen.getByText('Tối'));
  await settle();
  await openSheet(/^Ngôn ngữ/);
  expect(screen.getByText('✓ Theo hệ thống')).toBeTruthy();
  await fireEvent.press(screen.getByText('English'));
  await settle();
  expect(screen.getByText('General')).toBeTruthy();
  expect(screen.getByText('Support')).toBeTruthy();
  expect(row(/^Appearance/)).toHaveTextContent(/Dark/);
  expect(row(/^Language/)).toHaveTextContent(/English/);
  expect(row(/^Updates/)).toBeTruthy();
  expect(row(/^Error logs/)).toBeTruthy();
  expect(JSON.parse(fs.files.get(SETTINGS_PATH) as string)).toEqual({ theme: 'dark', language: 'en' });
});

test('the backdrop and the Android back button close a sheet without changing anything', async () => {
  await openSheet(/^Giao diện/);
  await fireEvent.press(screen.getByLabelText('Đóng', { includeHiddenElements: true }));
  await settle();
  expect(screen.queryByText('Sáng')).toBeNull();
  await openSheet(/^Giao diện/);
  // Hardware back: the host Modal's onRequestClose.
  let modal = screen.getByText('Sáng').parent;
  while (modal && !modal.props.onRequestClose) modal = modal.parent;
  await fireEvent(modal!, 'requestClose');
  await settle();
  expect(screen.queryByText('Sáng')).toBeNull();
  expect(setScheme).not.toHaveBeenCalledWith('light');
});

describe('error logs sheet', () => {
  test('explains and offers the send button', async () => {
    await openSheet(/^Log lỗi/);
    expect(screen.getByText('Gửi file log để giúp khắc phục lỗi.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gửi log lỗi' })).toBeTruthy();
  });

  test('English copy', async () => {
    await openSheet(/^Ngôn ngữ/);
    await fireEvent.press(screen.getByText('English'));
    await settle();
    await openSheet(/^Error logs/);
    expect(screen.getByText('Send the log files to help fix problems.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send error logs' })).toBeTruthy();
  });

  test('sending logs shares the export and logs it', async () => {
    mockExport.mockResolvedValue({ uri: 'file:///cache/l.txt', files: 2, bytes: 99 });
    await openSheet(/^Log lỗi/);
    await fireEvent.press(screen.getByText('Gửi log lỗi'));
    await settle();
    expect(mockShare).toHaveBeenCalledWith('file:///cache/l.txt');
    expect(log.info).toHaveBeenCalledWith('logs.exported', { files: 2, bytes: 99 });
  });

  test('with no logs an alert says so and nothing is shared', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockExport.mockResolvedValue(null);
    await openSheet(/^Log lỗi/);
    await fireEvent.press(screen.getByText('Gửi log lỗi'));
    await settle();
    expect(alert).toHaveBeenCalledWith('Chưa có log nào.');
    expect(mockShare).not.toHaveBeenCalled();
  });

  test('a share failure shows the SHARE error popup', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockExport.mockResolvedValue({ uri: 'file:///cache/l.txt', files: 1, bytes: 5 });
    mockShare.mockRejectedValue(new ShareError());
    await openSheet(/^Log lỗi/);
    await fireEvent.press(screen.getByText('Gửi log lỗi'));
    await settle();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(String(alert.mock.calls[0][1])).toContain('SHARE');
    expect(log.info).not.toHaveBeenCalledWith('logs.exported', expect.anything());
  });

  test('the send button is disabled while working', async () => {
    let release: (v: null) => void = () => {};
    mockExport.mockReturnValue(new Promise((r) => { release = r; }));
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await openSheet(/^Log lỗi/);
    await fireEvent.press(screen.getByText('Gửi log lỗi'));
    await settle();
    // The sheet closed before the export started; reopening shows the button disabled.
    expect(screen.queryByText('Gửi log lỗi')).toBeNull();
    await openSheet(/^Log lỗi/);
    expect(screen.getByRole('button', { name: 'Gửi log lỗi' })).toBeDisabled();
    await fireEvent.press(screen.getByText('Gửi log lỗi'));
    await act(async () => { release(null); });
    await settle();
    expect(mockExport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Gửi log lỗi' })).toBeEnabled();
  });
});

describe('updates sheet', () => {
  test('shows the version and the check button', async () => {
    await openSheet(/^Cập nhật/);
    expect(screen.getByText('Phiên bản 1.7.0 (7)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kiểm tra cập nhật' })).toBeTruthy();
  });

  test('English copy', async () => {
    await openSheet(/^Ngôn ngữ/);
    await fireEvent.press(screen.getByText('English'));
    await settle();
    await openSheet(/^Updates/);
    expect(screen.getByText('Version 1.7.0 (7)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeTruthy();
  });

  test('checking with nothing newer says up to date and closes the sheet', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await openSheet(/^Cập nhật/);
    await fireEvent.press(screen.getByText('Kiểm tra cập nhật'));
    await settle();
    expect(mockCheckNow).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Bạn đang dùng phiên bản mới nhất.');
    expect(screen.queryByText('Phiên bản 1.7.0 (7)')).toBeNull();
  });

  test('a failed check says so', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockCheckNow.mockResolvedValue('failed');
    await openSheet(/^Cập nhật/);
    await fireEvent.press(screen.getByText('Kiểm tra cập nhật'));
    await settle();
    expect(alert).toHaveBeenCalledWith('Không kiểm tra được cập nhật. Vui lòng thử lại khi có mạng.');
  });

  test.each(['optional', 'force'])('a %s update is left to the gate', async (kind) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockCheckNow.mockResolvedValue(kind);
    await openSheet(/^Cập nhật/);
    await fireEvent.press(screen.getByText('Kiểm tra cập nhật'));
    await settle();
    expect(alert).not.toHaveBeenCalled();
  });
});

test('the sheet closes before the update check or log sharing starts', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let sheetOpenWhenChecking: boolean | undefined;
  mockCheckNow.mockImplementation(async () => {
    sheetOpenWhenChecking = screen.queryByText('Phiên bản 1.7.0 (7)') !== null;
    return 'none';
  });
  await openSheet(/^Cập nhật/);
  await fireEvent.press(screen.getByText('Kiểm tra cập nhật'));
  await settle();
  expect(sheetOpenWhenChecking).toBe(false);

  let sheetOpenWhenSharing: boolean | undefined;
  mockExport.mockResolvedValue({ uri: 'file:///cache/l.txt', files: 1, bytes: 5 });
  mockShare.mockImplementation(async () => {
    sheetOpenWhenSharing = screen.queryByText('Gửi file log để giúp khắc phục lỗi.') !== null;
  });
  await openSheet(/^Log lỗi/);
  await fireEvent.press(screen.getByText('Gửi log lỗi'));
  await settle();
  expect(sheetOpenWhenSharing).toBe(false);
});

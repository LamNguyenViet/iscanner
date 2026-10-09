import { Alert, BackHandler, Platform } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { UpdateGate } from '../../src/components/UpdateGate';
import { UpdateCorruptError } from '../../src/errors/AppError';
import { LocaleProvider } from '../../src/i18n/LocaleContext';
import { createMemoryFs } from '../../src/library/memoryFs';
import { loadSettings } from '../../src/settings/settings';
import { UpdateProvider } from '../../src/update/UpdateContext';
import type { UpdateDeps } from '../../src/update/useUpdateCheck';
import { Pressable, Text } from 'react-native';

jest.mock('../../src/native/appBuild', () => ({
  currentAppBuild: () => ({ version: '1.7.0', build: 7 }),
}));
let mockLocales = [{ languageCode: 'vi', languageTag: 'vi-VN' }];
jest.mock('expo-localization', () => ({ useLocales: () => mockLocales }));

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const android = (min: number, latest: number, extra: object = {}) => ({
  android: { minBuild: min, latestBuild: latest, url: 'https://example.com/a.apk', md5: '0'.repeat(32), size: 12 * 1048576 },
  ...extra,
});

let fs: ReturnType<typeof createMemoryFs>;
let installApk: jest.Mock;
let openUrl: jest.Mock;
let backHandlers: (() => boolean)[];
const originalOS = Platform.OS;
const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });

async function mount(config: unknown, over: Partial<UpdateDeps> = {}) {
  await render(
    <LocaleProvider fs={fs}>
      <UpdateProvider
        deps={{
          fs,
          fetchConfig: async () => config,
          getBuild: () => ({ version: '1.7.0', build: 7 }),
          configUrl: 'https://example.com/u.json',
          now: () => 1_000_000,
          installApk,
          openUrl,
          clearCache: jest.fn(),
          ...over,
        }}
      >
        <UpdateGate>
          <Text>app content</Text>
        </UpdateGate>
      </UpdateProvider>
    </LocaleProvider>,
  );
  await settle();
}

beforeEach(() => {
  mockLocales = [{ languageCode: 'vi', languageTag: 'vi-VN' }];
  fs = createMemoryFs();
  installApk = jest.fn().mockResolvedValue(undefined);
  openUrl = jest.fn().mockResolvedValue(undefined);
  backHandlers = [];
  setOS('android');
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
    backHandlers.push(h as () => boolean);
    return { remove: jest.fn() };
  });
});
afterEach(() => {
  setOS(originalOS);
  jest.restoreAllMocks();
});

test('a force update overlays the app with Vietnamese copy', async () => {
  await mount(android(8, 8));
  expect(screen.getByText('app content', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByText('Cần cập nhật iScanner')).toBeTruthy();
  expect(screen.getByText('Phiên bản này đã cũ. Vui lòng cập nhật để tiếp tục sử dụng.')).toBeTruthy();
  expect(screen.getByText('Phiên bản hiện tại: 1.7.0 (7)')).toBeTruthy();
  expect(screen.getByText('Nếu Android hỏi, hãy cho phép iScanner cài ứng dụng rồi bấm Cập nhật lại.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cập nhật' })).toBeTruthy();
});

test('the overlay is English under an English locale and prefers the config message', async () => {
  mockLocales = [{ languageCode: 'en', languageTag: 'en-US' }];
  await mount(android(8, 8, { message: { en: 'Please upgrade now', vi: 'Hay nang cap' } }));
  expect(screen.getByText('Update required')).toBeTruthy();
  expect(screen.getByText('Please upgrade now')).toBeTruthy();
  expect(screen.getByText('Current version: 1.7.0 (7)')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Update' })).toBeTruthy();
});

test('hardware back is consumed while forced', async () => {
  await mount(android(8, 8));
  expect(backHandlers).toHaveLength(1);
  expect(backHandlers[0]()).toBe(true);
});

test('no overlay and no back handler when nothing is required', async () => {
  await mount(android(7, 7));
  expect(screen.queryByText('Cần cập nhật iScanner')).toBeNull();
  expect(backHandlers).toHaveLength(0);
});

test('Update installs the APK on Android and shows the download state', async () => {
  let release!: () => void;
  installApk.mockReturnValue(new Promise<void>((r) => (release = r)));
  await mount(android(8, 8));
  await fireEvent.press(screen.getByText('Cập nhật'));
  expect(installApk).toHaveBeenCalledWith(expect.objectContaining({ latestBuild: 8 }), expect.anything());
  expect(screen.getByText('Đang tải bản cập nhật… (≈ 12 MB)')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cập nhật' })).toBeDisabled();
  expect(screen.queryByText('Nếu Android hỏi, hãy cho phép iScanner cài ứng dụng rồi bấm Cập nhật lại.')).toBeNull();
  await act(async () => release());
  expect(screen.getByRole('button', { name: 'Cập nhật' })).toBeEnabled();
});

test('Update opens the page on iOS', async () => {
  setOS('ios');
  await mount({ ios: { minBuild: 8, latestBuild: 8, url: 'https://example.com/ios' } }, { platform: 'ios' });
  expect(screen.queryByText('Nếu Android hỏi, hãy cho phép iScanner cài ứng dụng rồi bấm Cập nhật lại.')).toBeNull();
  await fireEvent.press(screen.getByText('Cập nhật'));
  expect(openUrl).toHaveBeenCalledWith('https://example.com/ios');
  expect(installApk).not.toHaveBeenCalled();
});

test('a corrupt download shows the popup, keeps the overlay and re-enables the button', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  installApk.mockRejectedValue(new UpdateCorruptError());
  await mount(android(8, 8));
  await fireEvent.press(screen.getByText('Cập nhật'));
  await settle();
  expect(alert).toHaveBeenCalledTimes(1);
  expect(String(alert.mock.calls[0][0])).toBe('File cập nhật bị lỗi');
  expect(String(alert.mock.calls[0][1])).toContain('UPDATE_CORRUPT');
  expect(screen.getByText('Cần cập nhật iScanner')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cập nhật' })).toBeEnabled();
});

test('an optional update prompts once; Later persists the snooze', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await mount(android(7, 8));
  expect(screen.queryByText('Cần cập nhật iScanner')).toBeNull();
  expect(alert).toHaveBeenCalledTimes(1);
  const [title, body, buttons] = alert.mock.calls[0];
  expect(title).toBe('Đã có phiên bản mới');
  expect(body).toBe('Cập nhật để có các tính năng và bản sửa lỗi mới nhất.');
  expect(buttons!.map((b) => b.text)).toEqual(['Để sau', 'Cập nhật']);
  await act(async () => { buttons![0].onPress!(); });
  await settle();
  expect((await loadSettings(fs)).update?.snooze).toEqual({ build: 8, until: 1_000_000 + 24 * 3_600_000 });
});

test('the optional prompt Update button starts the install', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await mount(android(7, 8));
  await act(async () => { alert.mock.calls[0][2]![1].onPress!(); });
  await settle();
  expect(installApk).toHaveBeenCalledWith(expect.objectContaining({ latestBuild: 8 }), expect.anything());
});

test('Cancel while downloading keeps the force overlay with Update enabled', async () => {
  let release!: () => void;
  installApk.mockReturnValue(new Promise<void>((r) => (release = r)));
  await mount(android(8, 8));
  await fireEvent.press(screen.getByText('Cập nhật'));
  expect(screen.getByRole('button', { name: 'Huỷ' })).toBeTruthy();
  await fireEvent.press(screen.getByText('Huỷ'));
  expect(screen.getByText('Cần cập nhật iScanner')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cập nhật' })).toBeEnabled();
  expect(screen.queryByText(/Đang tải/)).toBeNull();
  await act(async () => release());
});

test('an optional download shows a banner that does not block the app', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  installApk.mockReturnValue(new Promise<void>(() => {}));
  const onPress = jest.fn();
  await render(
    <LocaleProvider fs={fs}>
      <UpdateProvider
        deps={{
          fs,
          fetchConfig: async () => android(7, 8),
          getBuild: () => ({ version: '1.7.0', build: 7 }),
          configUrl: 'https://example.com/u.json',
          now: () => 1_000_000,
          installApk,
          openUrl,
          clearCache: jest.fn(),
        }}
      >
        <UpdateGate>
          <Pressable onPress={onPress}>
            <Text>app button</Text>
          </Pressable>
        </UpdateGate>
      </UpdateProvider>
    </LocaleProvider>,
  );
  await settle();
  await act(async () => { alert.mock.calls[0][2]![1].onPress!(); });
  await settle();
  expect(screen.getByText('Đang tải bản cập nhật… (≈ 12 MB)')).toBeTruthy();
  expect(screen.queryByText('Cần cập nhật iScanner')).toBeNull();
  await fireEvent.press(screen.getByText('app button'));
  expect(onPress).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByText('Huỷ'));
  expect(screen.queryByText(/Đang tải/)).toBeNull();
});

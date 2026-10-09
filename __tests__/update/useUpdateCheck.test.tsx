import { Alert, AppState, type AppStateStatus } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { UpdateCorruptError } from '../../src/errors/AppError';
import { createMemoryFs } from '../../src/library/memoryFs';
import { log } from '../../src/logging/logger';
import { loadSettings, saveUpdateState } from '../../src/settings/settings';
import { useUpdateCheck, type UpdateDeps } from '../../src/update/useUpdateCheck';

const URL = 'https://example.com/update.json';
const cfg = (min: number, latest: number) => ({
  android: { minBuild: min, latestBuild: latest, url: 'https://example.com/a.apk', md5: '0'.repeat(32), size: 5 * 1048576 },
});
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let fs: ReturnType<typeof createMemoryFs>;
let clock: number;
let handlers: ((s: AppStateStatus) => void)[];
let fetchConfig: jest.Mock;
let clearCache: jest.Mock;
const deps = (over: Partial<UpdateDeps> = {}): UpdateDeps => ({
  fs,
  fetchConfig,
  getBuild: () => ({ version: '1.7.0', build: 7 }),
  platform: 'android',
  now: () => clock,
  configUrl: URL,
  clearCache,
  installApk: jest.fn().mockResolvedValue(undefined),
  openUrl: jest.fn().mockResolvedValue(undefined),
  ...over,
});
const stored = async () => (await loadSettings(fs)).update;
const mount = async (over: Partial<UpdateDeps> = {}) => {
  const r = await renderHook(() => useUpdateCheck(deps(over)));
  await settle();
  return r;
};

beforeEach(() => {
  jest.clearAllMocks();
  fs = createMemoryFs();
  clock = 1_000_000;
  fetchConfig = jest.fn().mockResolvedValue(cfg(8, 8));
  clearCache = jest.fn();
  handlers = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_t, h) => {
    handlers.push(h as (s: AppStateStatus) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});
afterEach(() => jest.restoreAllMocks());

test('mount with min 8 on build 7 forces and remembers it', async () => {
  const { result } = await mount();
  expect(result.current.decision.kind).toBe('force');
  expect(result.current.decision.target?.latestBuild).toBe(8);
  expect(await stored()).toMatchObject({ forceMinBuild: 8, lastCheckedAt: 1_000_000, lastBuild: 7 });
  expect(log.info).toHaveBeenCalledWith('update.available', { kind: 'force', from: 7, to: 8 });
});

test('remount with the fetch failing is still forced from memory', async () => {
  await mount();
  clock += 60 * 60_000;
  fetchConfig.mockRejectedValue(new Error('offline'));
  const { result } = await mount();
  expect(result.current.decision).toMatchObject({ kind: 'force', fromMemory: true });
  expect(log.warn).toHaveBeenCalledWith('update.checkFailed', expect.anything());
});

test('a throttled remount is still forced from memory without fetching', async () => {
  await mount();
  fetchConfig.mockClear();
  const { result } = await mount();
  expect(fetchConfig).not.toHaveBeenCalled();
  expect(result.current.decision).toMatchObject({ kind: 'force', fromMemory: true });
});

test('a later config with min 7 / latest 8 is optional and clears the remembered force', async () => {
  await mount();
  clock += 60 * 60_000;
  fetchConfig.mockResolvedValue(cfg(7, 8));
  const { result } = await mount();
  expect(result.current.decision.kind).toBe('optional');
  expect((await stored())?.forceMinBuild).toBeUndefined();
});

test('foreground checks are throttled to one per 30 minutes', async () => {
  await mount();
  expect(fetchConfig).toHaveBeenCalledTimes(1);
  clock += 10 * 60_000;
  await act(async () => handlers.forEach((h) => h('active')));
  await settle();
  expect(fetchConfig).toHaveBeenCalledTimes(1);
  clock += 25 * 60_000;
  await act(async () => handlers.forEach((h) => h('active')));
  await settle();
  expect(fetchConfig).toHaveBeenCalledTimes(2);
});

test('an empty config url never fetches and means none', async () => {
  const { result } = await mount({ configUrl: '' });
  expect(fetchConfig).not.toHaveBeenCalled();
  expect(result.current.decision.kind).toBe('none');
  await expect(result.current.checkNow()).resolves.toBe('none');
});

test('an invalid config is none plus a warning', async () => {
  fetchConfig.mockResolvedValue({ android: { minBuild: 'x' } });
  const { result } = await mount();
  expect(result.current.decision.kind).toBe('none');
  expect(log.warn).toHaveBeenCalledWith('update.checkFailed', expect.anything());
  await expect(result.current.checkNow()).resolves.toBe('failed');
});

test('an update seen since the last start logs update.installed and clears the cache', async () => {
  await saveUpdateState({ lastBuild: 6, forceMinBuild: 7 }, fs);
  fetchConfig.mockResolvedValue(cfg(7, 7));
  const { result } = await mount();
  expect(log.info).toHaveBeenCalledWith('update.installed', { from: 6, to: 7 });
  expect(clearCache).toHaveBeenCalledTimes(1);
  expect(result.current.decision.kind).toBe('none');
  expect(await stored()).toMatchObject({ lastBuild: 7 });
  expect((await stored())?.forceMinBuild).toBeUndefined();
});

test('no installed log when the build did not change', async () => {
  await saveUpdateState({ lastBuild: 7 }, fs);
  await mount();
  expect(clearCache).not.toHaveBeenCalled();
  expect(log.info).not.toHaveBeenCalledWith('update.installed', expect.anything());
});

test('snooze persists, hides the same latestBuild for 24 h and then expires', async () => {
  fetchConfig.mockResolvedValue(cfg(7, 8));
  const first = await mount();
  expect(first.result.current.decision.kind).toBe('optional');
  await act(async () => { await first.result.current.snooze(); });
  expect(first.result.current.decision.kind).toBe('none');
  expect(await stored()).toMatchObject({ snooze: { build: 8, until: 1_000_000 + 24 * 3_600_000 } });

  clock += 31 * 60_000;
  const again = await mount();
  expect(again.result.current.decision.kind).toBe('none');

  clock += 24 * 3_600_000;
  const later = await mount();
  expect(later.result.current.decision.kind).toBe('optional');
});

test('a new latestBuild is not snoozed', async () => {
  await saveUpdateState({ snooze: { build: 8, until: 1_000_000 + 1000 } }, fs);
  fetchConfig.mockResolvedValue(cfg(7, 9));
  const { result } = await mount();
  expect(result.current.decision.kind).toBe('optional');
});

test('checkNow ignores the throttle and the snooze', async () => {
  fetchConfig.mockResolvedValue(cfg(7, 8));
  const { result } = await mount();
  await act(async () => { await result.current.snooze(); });
  await expect(result.current.checkNow()).resolves.toBe('optional');
  expect(fetchConfig).toHaveBeenCalledTimes(2);
});

test('startUpdate installs on Android', async () => {
  const installApk = jest.fn().mockResolvedValue(undefined);
  const { result } = await mount({ installApk });
  await act(async () => { await result.current.startUpdate(); });
  expect(installApk).toHaveBeenCalledWith(expect.objectContaining({ latestBuild: 8 }));
  expect(log.info).toHaveBeenCalledWith('update.started');
});

test('startUpdate opens the page on iOS', async () => {
  const openUrl = jest.fn().mockResolvedValue(undefined);
  fetchConfig.mockResolvedValue({ ios: { minBuild: 8, latestBuild: 8, url: 'https://example.com/ios' } });
  const { result } = await mount({ platform: 'ios', openUrl });
  await act(async () => { await result.current.startUpdate(); });
  expect(openUrl).toHaveBeenCalledWith('https://example.com/ios');
});

test('an install failure is logged, shown and leaves busy false', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const installApk = jest.fn().mockRejectedValue(new UpdateCorruptError());
  const { result } = await mount({ installApk });
  await act(async () => { await result.current.startUpdate(); });
  expect(log.warn).toHaveBeenCalledWith('update.failed', { code: 'UPDATE_CORRUPT' });
  expect(String(alert.mock.calls[0][1])).toContain('UPDATE_CORRUPT');
  expect(result.current.busy).toBe(false);
  expect(result.current.decision.kind).toBe('force');
});

test('startUpdate from memory re-checks first and alerts when it still fails', async () => {
  await mount();
  clock += 60 * 60_000;
  fetchConfig.mockRejectedValue(new Error('offline'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const installApk = jest.fn();
  const { result } = await mount({ installApk });
  fetchConfig.mockClear();
  await act(async () => { await result.current.startUpdate(); });
  expect(fetchConfig).toHaveBeenCalledTimes(1);
  expect(installApk).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith('Không kiểm tra được cập nhật. Vui lòng thử lại khi có mạng.');
});

test('startUpdate from memory installs once the re-check succeeds', async () => {
  await mount();
  clock += 60 * 60_000;
  fetchConfig.mockRejectedValue(new Error('offline'));
  const installApk = jest.fn().mockResolvedValue(undefined);
  const { result } = await mount({ installApk });
  fetchConfig.mockResolvedValue(cfg(8, 9));
  await act(async () => { await result.current.startUpdate(); });
  expect(installApk).toHaveBeenCalledWith(expect.objectContaining({ latestBuild: 9 }));
});

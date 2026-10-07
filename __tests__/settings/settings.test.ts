import { createMemoryFs } from '../../src/library/memoryFs';
import {
  loadSettings,
  parseSettings,
  saveSettings,
  toNativeScheme,
} from '../../src/settings/settings';

const SYSTEM = { theme: 'system', language: 'system' };

test('toNativeScheme maps system to unspecified', () => {
  expect(toNativeScheme('system')).toBe('unspecified');
  expect(toNativeScheme('light')).toBe('light');
  expect(toNativeScheme('dark')).toBe('dark');
});

test('parseSettings reads stored values', () => {
  expect(parseSettings('{"theme":"dark","language":"en"}')).toEqual({ theme: 'dark', language: 'en' });
  expect(parseSettings('{"theme":"light","language":"vi"}')).toEqual({ theme: 'light', language: 'vi' });
});

test('parseSettings defaults a missing language to system', () => {
  expect(parseSettings('{"theme":"dark"}')).toEqual({ theme: 'dark', language: 'system' });
});

test.each(['{"theme":"blue","language":"fr"}', 'not json', '[]', 'null', '{}', null])(
  'parseSettings falls back to system for %s',
  (json) => {
    expect(parseSettings(json)).toEqual(SYSTEM);
  },
);

test('loadSettings defaults to system and round-trips a saved choice', async () => {
  const fs = createMemoryFs();
  expect(await loadSettings(fs)).toEqual(SYSTEM);
  await saveSettings({ theme: 'dark' }, fs);
  expect(JSON.parse(fs.files.get('settings.json') as string)).toEqual({
    theme: 'dark',
    language: 'system',
  });
  expect(await loadSettings(fs)).toEqual({ theme: 'dark', language: 'system' });
});

test('loadSettings never throws when reading fails', async () => {
  const fs = createMemoryFs();
  fs.readText = () => Promise.reject(new Error('io'));
  expect(await loadSettings(fs)).toEqual(SYSTEM);
});

test('saveSettings merges the patch into the stored file', async () => {
  const fs = createMemoryFs();
  fs.files.set('settings.json', '{"theme":"dark"}');
  await saveSettings({ language: 'en' }, fs);
  expect(JSON.parse(fs.files.get('settings.json') as string)).toEqual({
    theme: 'dark',
    language: 'en',
  });
});

test('concurrent saves do not lose a write', async () => {
  const fs = createMemoryFs();
  const read = fs.readText.bind(fs);
  fs.readText = async (path: string) => {
    await Promise.resolve();
    return read(path);
  };
  await Promise.all([saveSettings({ theme: 'dark' }, fs), saveSettings({ language: 'en' }, fs)]);
  expect(JSON.parse(fs.files.get('settings.json') as string)).toEqual({
    theme: 'dark',
    language: 'en',
  });
});

test('saveSettings rejects when the write fails and later saves still work', async () => {
  const fs = createMemoryFs();
  fs.failNextWrite('settings.json');
  await expect(saveSettings({ theme: 'light' }, fs)).rejects.toThrow();
  await saveSettings({ theme: 'light' }, fs);
  expect(JSON.parse(fs.files.get('settings.json') as string)).toMatchObject({ theme: 'light' });
});

const upd = { lastCheckedAt: 5, forceMinBuild: 8, snooze: { build: 9, until: 10 }, lastBuild: 7 };

test('parseSettings keeps a valid update block', () => {
  expect(parseSettings(JSON.stringify({ theme: 'dark', update: upd }))).toEqual({ theme: 'dark', language: 'system', update: upd });
  expect(parseSettings('{"update":{}}').update).toEqual({});
});

test.each([
  { lastCheckedAt: 'x' }, { forceMinBuild: 1.5 }, { snooze: { build: 9 } }, { lastBuild: 0 }, 'str', null, [],
])('parseSettings drops an invalid update block %j', (bad) => {
  const r = parseSettings(JSON.stringify({ theme: 'dark', language: 'en', update: bad }));
  expect(r.update).toBeUndefined();
  expect(r).toMatchObject({ theme: 'dark', language: 'en' });
});

test('old settings files still parse without update', () => {
  expect(parseSettings('{"theme":"dark"}')).toEqual({ theme: 'dark', language: 'system' });
  expect(parseSettings('{"theme":"dark","language":"en"}')).toEqual({ theme: 'dark', language: 'en' });
});

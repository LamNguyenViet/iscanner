import { createMemoryFs } from '../../src/library/memoryFs';
import {
  loadPreference,
  parsePreference,
  savePreference,
  toNativeScheme,
} from '../../src/theme/preference';

test('toNativeScheme maps system to unspecified', () => {
  expect(toNativeScheme('system')).toBe('unspecified');
  expect(toNativeScheme('light')).toBe('light');
  expect(toNativeScheme('dark')).toBe('dark');
});

test('parsePreference reads a stored theme', () => {
  expect(parsePreference('{"theme":"dark"}')).toBe('dark');
  expect(parsePreference('{"theme":"light"}')).toBe('light');
  expect(parsePreference('{"theme":"system"}')).toBe('system');
});

test.each(['{"theme":"blue"}', 'not json', '[]', 'null', '{}'])(
  'parsePreference falls back to system for %s',
  (json) => {
    expect(parsePreference(json)).toBe('system');
  },
);

test('parsePreference falls back to system for a missing file', () => {
  expect(parsePreference(null)).toBe('system');
});

test('loadPreference defaults to system and round-trips a saved choice', async () => {
  const fs = createMemoryFs();
  expect(await loadPreference(fs)).toBe('system');
  await savePreference('dark', fs);
  expect(JSON.parse(fs.files.get('settings.json') as string)).toEqual({ theme: 'dark' });
  expect(await loadPreference(fs)).toBe('dark');
});

test('loadPreference never throws when reading fails', async () => {
  const fs = createMemoryFs();
  fs.readText = () => Promise.reject(new Error('io'));
  expect(await loadPreference(fs)).toBe('system');
});

test('savePreference rejects when the write fails', async () => {
  const fs = createMemoryFs();
  fs.failNextWrite('settings.json');
  await expect(savePreference('light', fs)).rejects.toThrow();
});

import { parseUpdateConfig } from '../../src/update/config';

const md5 = '0123456789abcdef0123456789abcdef';
const android = { minBuild: 7, latestBuild: 8, url: 'https://x.test/a.apk', md5, size: 88000000 };
const ios = { minBuild: 7, latestBuild: 8, url: 'https://x.test/update-ios' };

test('accepts the spec example', () => {
  const json = { android, ios, message: { vi: 'xin chao', en: 'hello' } };
  expect(parseUpdateConfig(json)).toEqual(json);
});

test.each([
  ['minBuild 0', { ...android, minBuild: 0 }],
  ['non-integer minBuild', { ...android, minBuild: 7.5 }],
  ['non-integer latestBuild', { ...android, latestBuild: '8' }],
  ['latest < min', { ...android, minBuild: 9, latestBuild: 8 }],
  ['http url', { ...android, url: 'http://x.test/a.apk' }],
  ['missing md5', { ...android, md5: undefined }],
  ['short md5', { ...android, md5: 'abcd' }],
  ['non-hex md5', { ...android, md5: 'z'.repeat(32) }],
  ['size 0', { ...android, size: 0 }],
  ['negative size', { ...android, size: -5 }],
  ['fractional size', { ...android, size: 1.5 }],
])('invalid android (%s) drops the block', (_n, bad) => {
  expect(parseUpdateConfig({ android: bad, ios })).toEqual({ ios });
});

test('invalid ios block is dropped', () => {
  expect(parseUpdateConfig({ android, ios: { ...ios, url: 'ftp://x' } })).toEqual({ android });
});

test('ios does not need md5', () => {
  expect(parseUpdateConfig({ ios })).toEqual({ ios });
});

test.each([[null], ['str'], [[]], [42], [{}], [{ android: { ...android, minBuild: 0 }, ios: { ...ios, url: 'http://x' } }]])(
  'gives null for %j', (json) => {
    expect(parseUpdateConfig(json)).toBeNull();
  },
);

test('truncates messages to 300 characters', () => {
  const r = parseUpdateConfig({ ios, message: { vi: 'a'.repeat(400), en: 'b' } });
  expect(r?.message?.vi).toBe('a'.repeat(300));
  expect(r?.message?.en).toBe('b');
});

test('accepts an uppercase md5', () => {
  const up = md5.toUpperCase();
  expect(parseUpdateConfig({ android: { ...android, md5: up } })?.android?.md5).toBe(up);
});

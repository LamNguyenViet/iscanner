import { resolveLanguage, stringsFor } from '../../src/i18n/language';
import { en } from '../../src/i18n/en';
import { vi } from '../../src/i18n/vi';

describe('resolveLanguage', () => {
  test('explicit preference wins over the device', () => {
    expect(resolveLanguage('vi', 'en')).toBe('vi');
    expect(resolveLanguage('en', 'vi')).toBe('en');
  });
  test('system follows a Vietnamese device', () => {
    expect(resolveLanguage('system', 'vi')).toBe('vi');
    expect(resolveLanguage('system', 'vi-VN')).toBe('vi');
  });
  test('system falls back to English', () => {
    expect(resolveLanguage('system', 'en-US')).toBe('en');
    expect(resolveLanguage('system', 'fr')).toBe('en');
    expect(resolveLanguage('system', null)).toBe('en');
    expect(resolveLanguage('system', undefined)).toBe('en');
  });
});

describe('stringsFor', () => {
  test('returns the table for the language', () => {
    expect(stringsFor('en')).toBe(en);
    expect(stringsFor('vi')).toBe(vi);
  });
  test('pages pluralises', () => {
    expect(en.format.pages(1)).toBe('1 page');
    expect(en.format.pages(2)).toBe('2 pages');
    expect(vi.format.pages(3)).toBe('3 trang');
  });
});

import {
  formatDate,
  defaultName,
  formatSize,
  sanitizeName,
  shareFileName,
} from '../../src/utils/format';

describe('shareFileName', () => {
  test('keeps Vietnamese names and adds .pdf', () => {
    expect(shareFileName('Hợp đồng tổng hợp')).toBe('Hợp đồng tổng hợp.pdf');
  });

  test('replaces characters not allowed in file names', () => {
    expect(shareFileName('Hoá/đơn: 05\\10 *?"<>|')).toBe('Hoá-đơn- 05-10 ------.pdf');
  });

  test('collapses whitespace and strips trailing dots', () => {
    expect(shareFileName('  Báo   cáo\n quý..  ')).toBe('Báo cáo quý.pdf');
  });

  test('falls back when nothing usable is left', () => {
    expect(shareFileName('   ')).toBe('tai-lieu.pdf');
    expect(shareFileName('...')).toBe('tai-lieu.pdf');
  });

  test('limits the base name to 100 characters', () => {
    expect(shareFileName('a'.repeat(150))).toBe('a'.repeat(100) + '.pdf');
  });
});

describe('formatDate', () => {
  test('formats ISO string to dd/MM/yyyy HH:mm in local time', () => {
    const d = new Date(2026, 9, 5, 14, 3); // October 5, 2026, 14:03 local
    expect(formatDate(d.toISOString())).toBe('05/10/2026 14:03');
  });
});

describe('defaultName', () => {
  test('returns Scan prefix with formatted date and time', () => {
    const d = new Date(2026, 9, 5, 14, 3);
    expect(defaultName('scan', d)).toBe('Scan 05-10-2026 14.03');
  });

  test('returns Gộp prefix with formatted date and time', () => {
    const d = new Date(2026, 9, 5, 14, 3);
    expect(defaultName('merge', d)).toBe('Gộp 05-10-2026 14.03');
  });
});

describe('formatSize', () => {
  test('formats bytes as B without decimal', () => {
    expect(formatSize(512)).toBe('512 B');
  });

  test('formats KB with 1 decimal place', () => {
    expect(formatSize(1536)).toBe('1.5 KB');
  });

  test('formats MB with 1 decimal place', () => {
    expect(formatSize(2.3 * 1024 * 1024)).toBe('2.3 MB');
  });
});

describe('sanitizeName', () => {
  test('trims whitespace from input', () => {
    expect(sanitizeName('  Hợp đồng  ', 'X')).toBe('Hợp đồng');
  });

  test('returns fallback for whitespace-only input', () => {
    expect(sanitizeName('   ', 'Scan 05-10-2026 14.03')).toBe(
      'Scan 05-10-2026 14.03'
    );
  });

  test('truncates to 100 characters', () => {
    expect(sanitizeName('a'.repeat(150), 'X')).toHaveLength(100);
  });
});

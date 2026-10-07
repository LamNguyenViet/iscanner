import { exportLogs } from '../../src/logging/exportLogs';
import { createMemoryFs } from '../../src/library/memoryFs';

const meta = { app: '1.6.0', os: 'android 34', language: 'vi' };
const now = () => new Date(2026, 9, 7, 19, 35, 12, 481);

function setup() {
  const fs = createMemoryFs();
  const order: string[] = [];
  const logger = { flush: jest.fn(async () => { order.push('flush'); }) };
  const writeExport = jest.fn(async (name: string, _text: string) => {
    order.push('write');
    return `file:///cache/${name}`;
  });
  return { fs, order, logger, writeExport };
}

test('bundles valid daily logs in ascending order after a header', async () => {
  const { fs, order, logger, writeExport } = setup();
  fs.files.set('logs/2026-10-07.log', 'b\n');
  fs.files.set('logs/2026-10-06.log', 'a\n');
  fs.files.set('logs/junk.txt', 'zzz');
  const res = await exportLogs({ fs, logger, now, meta, writeExport });

  expect(order).toEqual(['flush', 'write']);
  expect(writeExport).toHaveBeenCalledTimes(1);
  const [name, text] = writeExport.mock.calls[0];
  expect(name).toBe('iScanner-logs-2026-10-07.txt');
  expect(text.startsWith('iScanner 1.6.0 · android 34 · vi · 2026-10-07T19:35:12.481')).toBe(true);
  expect(text).toContain('=== 2026-10-06.log ===\na\n');
  expect(text.indexOf('=== 2026-10-06.log ===')).toBeLessThan(text.indexOf('=== 2026-10-07.log ==='));
  expect(text).not.toContain('junk');
  expect(res).toEqual({ uri: 'file:///cache/iScanner-logs-2026-10-07.txt', files: 2, bytes: text.length });
});

test('returns null when there are no logs', async () => {
  const { fs, logger, writeExport } = setup();
  fs.files.set('logs/junk.txt', 'zzz');
  expect(await exportLogs({ fs, logger, now, meta, writeExport })).toBeNull();
  expect(writeExport).not.toHaveBeenCalled();
});

test('an unreadable file gets a marker and the export still succeeds', async () => {
  const { fs, logger, writeExport } = setup();
  fs.files.set('logs/2026-10-06.log', 'a\n');
  fs.files.set('logs/2026-10-07.log', 'b\n');
  fs.failNextRead('logs/2026-10-06.log');
  const res = await exportLogs({ fs, logger, now, meta, writeExport });
  const text = writeExport.mock.calls[0][1];
  expect(text).toContain('=== 2026-10-06.log ===\n[unreadable: Error]\n');
  expect(text).toContain('=== 2026-10-07.log ===\nb\n');
  expect(res?.files).toBe(2);
});

import { ShareError } from '../../src/errors/AppError';
import { shareLogFile, writeLogExport } from '../../src/native/shareLogs';

const mockShareAsync = jest.fn();
jest.mock('expo-sharing', () => ({
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

const mockWrites: { uri: string; text: string }[] = [];
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    exists = false;
    constructor(parent: { uri: string } | string, name?: string) {
      const base = typeof parent === 'string' ? parent : parent.uri;
      this.uri = name ? `${base.replace(/\/$/, '')}/${name}` : base;
    }
    create() {}
    write(text: string) {
      mockWrites.push({ uri: this.uri, text });
    }
  }
  return { File, Paths: { cache: { uri: 'file:///cache/' } } };
});

beforeEach(() => {
  mockWrites.length = 0;
  mockShareAsync.mockReset();
  mockShareAsync.mockResolvedValue(undefined);
});

test('writeLogExport writes into the cache and returns the uri', async () => {
  const uri = await writeLogExport('x.txt', 'hello');
  expect(uri).toBe('file:///cache/x.txt');
  expect(mockWrites).toEqual([{ uri: 'file:///cache/x.txt', text: 'hello' }]);
});

test('shareLogFile shares as plain text', async () => {
  await shareLogFile('file:///cache/x.txt');
  expect(mockShareAsync).toHaveBeenCalledWith('file:///cache/x.txt', {
    mimeType: 'text/plain',
    UTI: 'public.plain-text',
  });
});

test('a failing share rejects with ShareError keeping the cause', async () => {
  const cause = new Error('nope');
  mockShareAsync.mockRejectedValueOnce(cause);
  const err = await shareLogFile('file:///cache/x.txt').catch((e) => e);
  expect(err).toBeInstanceOf(ShareError);
  expect(err.cause).toBe(cause);
});

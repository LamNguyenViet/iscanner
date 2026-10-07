import { importIncoming, MAX_INCOMING_BYTES } from '../../src/share/importIncoming';

const mockStore = new Map<string, Uint8Array>();
const mockSizes = new Map<string, number>();
const mockFailing = new Set<string>();
const mockUndeletable = new Set<string>();

jest.mock('expo-file-system', () => {
  const join = (parts: any[]) =>
    parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class File {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = join(parts);
    }
    get size() {
      return mockSizes.get(this.uri) ?? mockStore.get(this.uri)?.length ?? 0;
    }
    async bytes() {
      if (mockFailing.has(this.uri)) throw new Error('denied');
      const b = mockStore.get(this.uri);
      if (!b) throw new Error('missing');
      return b;
    }
    create() {}
    write(b: Uint8Array) {
      mockStore.set(this.uri, b);
    }
    delete() {
      if (mockUndeletable.has(this.uri)) throw new Error('busy');
      mockStore.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = join(parts);
    }
    create() {}
  }
  return { File, Directory, Paths: { cache: { uri: 'file:///cache' } } };
});

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

beforeEach(() => {
  mockStore.clear();
  mockSizes.clear();
  mockFailing.clear();
  mockUndeletable.clear();
});

const incomingKeys = () => [...mockStore.keys()].filter((k) => k.includes('/incoming/'));

test('imports pdf and image', async () => {
  mockStore.set('content://a/doc.pdf', PDF);
  mockStore.set('content://a/pic', JPEG);
  const { files, skipped } = await importIncoming([
    { uri: 'content://a/doc.pdf', name: 'doc.pdf' },
    { uri: 'content://a/pic', name: 'pic.jpg' },
  ]);
  expect(skipped).toEqual([]);
  expect(files.map((f) => f.kind)).toEqual(['pdf', 'image']);
  expect(files[0].uri).toMatch(/\/incoming\/.+\.pdf$/);
  expect(files[1].uri).toMatch(/\/incoming\/.+\.jpg$/);
  expect(mockStore.get(files[0].uri)).toEqual(PDF);
});

test('names and extensions from bytes', async () => {
  mockStore.set('content://x/123', PDF);
  const { files } = await importIncoming([{ uri: 'content://x/123' }]);
  expect(files[0].name).toBe('123');
  expect(files[0].uri.endsWith('.pdf')).toBe(true);
});

test('skips unreadable and too large', async () => {
  mockFailing.add('content://x/bad');
  mockStore.set('content://x/big', PDF);
  mockSizes.set('content://x/big', MAX_INCOMING_BYTES + 1);
  mockStore.set('content://x/ok', PDF);
  const { files, skipped } = await importIncoming([
    { uri: 'content://x/bad', name: 'bad.pdf' },
    { uri: 'content://x/big', name: 'big.pdf' },
    { uri: 'content://x/ok', name: 'ok.pdf' },
  ]);
  expect(files).toHaveLength(1);
  expect(skipped).toEqual([
    { name: 'bad.pdf', reason: 'unreadable' },
    { name: 'big.pdf', reason: 'too-large' },
  ]);
  expect(incomingKeys()).toEqual([files[0].uri]);
});

test('skips unsupported', async () => {
  mockStore.set('content://x/junk', new Uint8Array([1, 2, 3, 4, 5, 6]));
  const { files, skipped } = await importIncoming([{ uri: 'content://x/junk', name: 'junk' }]);
  expect(files).toEqual([]);
  expect(skipped).toEqual([{ name: 'junk', reason: 'unsupported' }]);
  expect(incomingKeys()).toEqual([]);
});

describe('iOS Documents/Inbox sources', () => {
  const INBOX = 'file:///var/mobile/ABC/Documents/Inbox/a.pdf';

  test('are deleted after a successful import', async () => {
    mockStore.set(INBOX, PDF);
    const { files } = await importIncoming([{ uri: INBOX }]);
    expect(files).toHaveLength(1);
    expect(mockStore.has(INBOX)).toBe(false);
  });

  test('are kept when skipped', async () => {
    mockStore.set(INBOX, new Uint8Array([1, 2, 3, 4, 5, 6]));
    await importIncoming([{ uri: INBOX }]);
    expect(mockStore.has(INBOX)).toBe(true);
  });

  test('a failed delete does not fail the import', async () => {
    mockStore.set(INBOX, PDF);
    mockUndeletable.add(INBOX);
    const { files, skipped } = await importIncoming([{ uri: INBOX }]);
    expect(files).toHaveLength(1);
    expect(skipped).toEqual([]);
  });

  test('other file and content sources are never deleted', async () => {
    const other = 'file:///var/mobile/ABC/Documents/pdfs/x.pdf';
    mockStore.set(other, PDF);
    mockStore.set('content://x/ok', PDF);
    await importIncoming([{ uri: other }, { uri: 'content://x/ok' }]);
    expect(mockStore.has(other)).toBe(true);
    expect(mockStore.has('content://x/ok')).toBe(true);
  });
});

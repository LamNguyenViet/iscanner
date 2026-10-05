import { shareDocument } from '../../src/native/share';

const mockShareAsync = jest.fn();
jest.mock('expo-sharing', () => ({
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

const mockCalls: string[] = [];
jest.mock('expo-file-system', () => {
  const join = (parent: { uri: string } | string, name?: string) => {
    const base = typeof parent === 'string' ? parent : parent.uri;
    return name ? `${base.replace(/\/$/, '')}/${name}` : base;
  };
  class Directory {
    uri: string;
    exists = true;
    constructor(parent: { uri: string } | string, name?: string) {
      this.uri = join(parent, name);
    }
    delete() {
      mockCalls.push(`deleteDir ${this.uri}`);
    }
    create() {
      mockCalls.push(`createDir ${this.uri}`);
    }
  }
  class File {
    uri: string;
    constructor(parent: { uri: string } | string, name?: string) {
      this.uri = join(parent, name);
    }
    copySync(dest: { uri: string }) {
      mockCalls.push(`copy ${this.uri} -> ${dest.uri}`);
    }
  }
  return { Directory, File, Paths: { cache: { uri: 'file:///cache/' } } };
});

beforeEach(() => {
  mockCalls.length = 0;
  mockShareAsync.mockReset();
  mockShareAsync.mockResolvedValue(undefined);
});

test('shares a copy named after the document', async () => {
  await shareDocument('file:///docs/pdfs/abc123.pdf', 'Hợp đồng: bản 2');

  expect(mockCalls).toEqual([
    'deleteDir file:///cache/share',
    'createDir file:///cache/share',
    'copy file:///docs/pdfs/abc123.pdf -> file:///cache/share/Hợp đồng- bản 2.pdf',
  ]);
  expect(mockShareAsync).toHaveBeenCalledWith('file:///cache/share/Hợp đồng- bản 2.pdf', {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  });
});

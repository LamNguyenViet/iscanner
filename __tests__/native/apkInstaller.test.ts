import { UpdateCorruptError, UpdateDownloadError, UpdateInstallError } from '../../src/errors/AppError';
import { downloadAndInstallApk } from '../../src/native/apkInstaller';

const mockCalls: string[] = [];
let mockStale: string[] = [];
let mockDeleteThrows = false;
let mockMd5: string | null = 'ABCDEFABCDEFABCDEFABCDEFABCDEFAB';
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
    list() {
      return mockStale.map((n) => new File(this, n));
    }
  }
  class File {
    uri: string;
    exists = true;
    contentUri = 'content://provider/apk';
    constructor(parent: { uri: string } | string, name?: string) {
      this.uri = join(parent, name);
    }
    get md5() {
      return mockMd5;
    }
    delete() {
      mockCalls.push(`deleteFile ${this.uri}`);
      if (mockDeleteThrows && !this.uri.includes('iScanner-8-')) throw new Error('locked');
    }
  }
  return { Directory, File, Paths: { cache: { uri: 'file:///cache/' } } };
});
jest.mock('expo-intent-launcher', () => ({ startActivityAsync: jest.fn() }));

const target = {
  minBuild: 1,
  latestBuild: 8,
  url: 'https://x.test/a.apk',
  md5: 'abcdefabcdefabcdefabcdefabcdefab',
};

beforeEach(() => {
  mockCalls.length = 0;
  mockStale = [];
  mockDeleteThrows = false;
  mockMd5 = 'ABCDEFABCDEFABCDEFABCDEFABCDEFAB';
});

test('downloads, verifies md5 case-insensitively and starts the installer', async () => {
  const downloadFile = jest.fn(async (_u: string, dest: unknown) => dest as never);
  const startActivity = jest.fn().mockResolvedValue({});
  await downloadAndInstallApk(target, { downloadFile, startActivity });
  expect(mockCalls).toEqual(['createDir file:///cache/update']);
  expect(downloadFile.mock.calls[0][0]).toBe(target.url);
  expect((downloadFile.mock.calls[0][1] as { uri: string }).uri).toMatch(
    /^file:\/\/\/cache\/update\/iScanner-8-[\w-]+\.apk$/,
  );
  expect(startActivity).toHaveBeenCalledWith('android.intent.action.VIEW', {
    data: 'content://provider/apk',
    type: 'application/vnd.android.package-archive',
    flags: 0x10000001,
  });
});

test('md5 mismatch deletes the file and throws UpdateCorruptError', async () => {
  mockMd5 = '00000000000000000000000000000000';
  const downloadFile = jest.fn(async (_u: string, dest: unknown) => dest as never);
  const startActivity = jest.fn();
  await expect(downloadAndInstallApk(target, { downloadFile, startActivity })).rejects.toBeInstanceOf(
    UpdateCorruptError,
  );
  expect(mockCalls.some((c) => /^deleteFile file:\/\/\/cache\/update\/iScanner-8-[\w-]+\.apk$/.test(c))).toBe(true);
  expect(startActivity).not.toHaveBeenCalled();
});

test('download failure throws UpdateDownloadError with cause', async () => {
  const cause = new Error('net');
  const downloadFile = jest.fn().mockRejectedValue(cause);
  const err = await downloadAndInstallApk(target, { downloadFile, startActivity: jest.fn() }).catch(e => e);
  expect(err).toBeInstanceOf(UpdateDownloadError);
  expect(err.cause).toBe(cause);
});

test('startActivity failure throws UpdateInstallError with cause', async () => {
  const cause = new Error('no activity');
  const downloadFile = jest.fn(async (_u: string, dest: unknown) => dest as never);
  const startActivity = jest.fn().mockRejectedValue(cause);
  const err = await downloadAndInstallApk(target, { downloadFile, startActivity }).catch(e => e);
  expect(err).toBeInstanceOf(UpdateInstallError);
  expect(err.cause).toBe(cause);
});

test('a cancel seen after download and verification skips the installer', async () => {
  const startActivity = jest.fn();
  const { downloadFile } = (() => {
    const file = { md5: target.md5, contentUri: 'content://x', delete: jest.fn() };
    return { downloadFile: jest.fn().mockResolvedValue(file) };
  })();
  await downloadAndInstallApk(target, { downloadFile, startActivity, isCancelled: () => true });
  expect(downloadFile).toHaveBeenCalled();
  expect(startActivity).not.toHaveBeenCalled();
});

test('two runs download to different file names', async () => {
  const downloadFile = jest.fn(async (_u: string, dest: unknown) => dest as never);
  const startActivity = jest.fn().mockResolvedValue({});
  await downloadAndInstallApk(target, { downloadFile, startActivity });
  await downloadAndInstallApk(target, { downloadFile, startActivity });
  const a = (downloadFile.mock.calls[0][1] as { uri: string }).uri;
  const b = (downloadFile.mock.calls[1][1] as { uri: string }).uri;
  expect(a).not.toBe(b);
});

test('stale apk files are deleted one by one, never the whole directory', async () => {
  mockStale = ['iScanner-7-1.apk', 'notes.txt'];
  const downloadFile = jest.fn(async (_u: string, dest: unknown) => dest as never);
  await downloadAndInstallApk(target, { downloadFile, startActivity: jest.fn().mockResolvedValue({}) });
  expect(mockCalls).toContain('deleteFile file:///cache/update/iScanner-7-1.apk');
  expect(mockCalls).not.toContain('deleteFile file:///cache/update/notes.txt');
  expect(mockCalls.some((c) => c.startsWith('deleteDir'))).toBe(false);
});

test('a failing stale delete does not fail the run', async () => {
  mockStale = ['iScanner-7-1.apk'];
  mockDeleteThrows = true;
  const downloadFile = jest.fn(async (_u: string, dest: unknown) => dest as never);
  const startActivity = jest.fn().mockResolvedValue({});
  await downloadAndInstallApk(target, { downloadFile, startActivity });
  expect(startActivity).toHaveBeenCalled();
});

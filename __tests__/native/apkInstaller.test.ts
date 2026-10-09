import { UpdateCorruptError, UpdateDownloadError, UpdateInstallError } from '../../src/errors/AppError';
import { downloadAndInstallApk } from '../../src/native/apkInstaller';

const mockCalls: string[] = [];
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
  mockMd5 = 'ABCDEFABCDEFABCDEFABCDEFABCDEFAB';
});

test('downloads, verifies md5 case-insensitively and starts the installer', async () => {
  const downloadFile = jest.fn(async (_u: string, dest: unknown) => dest as never);
  const startActivity = jest.fn().mockResolvedValue({});
  await downloadAndInstallApk(target, { downloadFile, startActivity });
  expect(mockCalls).toEqual(['deleteDir file:///cache/update', 'createDir file:///cache/update']);
  expect(downloadFile.mock.calls[0][0]).toBe(target.url);
  expect((downloadFile.mock.calls[0][1] as { uri: string }).uri).toBe('file:///cache/update/iScanner-8.apk');
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
  expect(mockCalls).toContain('deleteFile file:///cache/update/iScanner-8.apk');
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

import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { clearSharedFiles, hasSharedFiles, readSharedFiles } from '../../src/native/sharedPayloads';

jest.mock('expo-sharing', () => ({
  getResolvedSharedPayloadsAsync: jest.fn(),
  getSharedPayloads: jest.fn(),
  clearSharedPayloads: jest.fn(),
}));
const getResolved = Sharing.getResolvedSharedPayloadsAsync as jest.Mock;
const getPending = Sharing.getSharedPayloads as jest.Mock;

beforeEach(() => {
  Platform.OS = 'android';
  getResolved.mockReset();
  getPending.mockReset();
});

describe('readSharedFiles', () => {
  test('returns the original file and image URIs, ignoring text, url, video and non-file values', async () => {
    getPending.mockReturnValue([
      { shareType: 'file', mimeType: 'application/pdf', value: 'content://a/doc%3Ahop-dong.pdf' },
      { shareType: 'image', mimeType: 'image/jpeg', value: 'content://a/x%20y.jpg' },
      { shareType: 'text', mimeType: 'text/plain', value: 'hello' },
      { shareType: 'url', mimeType: 'text/plain', value: 'https://x.y' },
      { shareType: 'video', mimeType: 'video/mp4', value: 'content://a/v.mp4' },
      { shareType: 'file', mimeType: 'application/pdf', value: '' },
      { shareType: 'file', mimeType: 'application/pdf', value: 'https://evil/x.pdf' },
    ]);
    expect(await readSharedFiles()).toEqual([
      { uri: 'content://a/doc%3Ahop-dong.pdf', name: 'hop-dong.pdf' },
      { uri: 'content://a/x%20y.jpg', name: 'x y.jpg' },
    ]);
  });

  test('never uses the resolving API (it copies files to cache under a sender-chosen name)', async () => {
    getPending.mockReturnValue([{ shareType: 'file', value: 'content://a/1' }]);
    await readSharedFiles();
    expect(getResolved).not.toHaveBeenCalled();
  });

  test('returns [] when the API throws or off Android', async () => {
    getPending.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(await readSharedFiles()).toEqual([]);
    Platform.OS = 'ios';
    getPending.mockReturnValue([{ shareType: 'file', value: 'content://a/1' }]);
    expect(await readSharedFiles()).toEqual([]);
  });
});

describe('hasSharedFiles', () => {
  test('true while a share is waiting', () => {
    getPending.mockReturnValue([{ shareType: 'file', mimeType: 'application/pdf', value: 'content://a/1' }]);
    expect(hasSharedFiles()).toBe(true);
  });

  test('false when nothing is waiting, the API throws, or off Android', () => {
    getPending.mockReturnValue([]);
    expect(hasSharedFiles()).toBe(false);
    getPending.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(hasSharedFiles()).toBe(false);
    Platform.OS = 'ios';
    getPending.mockReturnValue([{ shareType: 'file', mimeType: 'application/pdf', value: 'x' }]);
    expect(hasSharedFiles()).toBe(false);
  });
});

test('clearSharedFiles clears payloads', () => {
  clearSharedFiles();
  expect(Sharing.clearSharedPayloads).toHaveBeenCalled();
});

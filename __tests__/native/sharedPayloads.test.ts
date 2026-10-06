import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { clearSharedFiles, readSharedFiles } from '../../src/native/sharedPayloads';

jest.mock('expo-sharing', () => ({
  getResolvedSharedPayloadsAsync: jest.fn(),
  clearSharedPayloads: jest.fn(),
}));
const getPayloads = Sharing.getResolvedSharedPayloadsAsync as jest.Mock;

beforeEach(() => {
  Platform.OS = 'android';
  getPayloads.mockReset();
});

test('maps file and image payloads, ignores text and url', async () => {
  getPayloads.mockResolvedValue([
    { contentType: 'file', contentUri: 'content://a/1', originalName: 'a.pdf', value: 'content://a/1' },
    { contentType: 'image', contentUri: 'content://a/2', originalName: null, value: 'content://a/x%20y.jpg' },
    { contentType: 'text', contentUri: null, value: 'hello' },
    { contentType: 'website', contentUri: 'https://x.y', value: 'https://x.y' },
    { contentType: 'file', contentUri: null, value: '' },
  ]);
  expect(await readSharedFiles()).toEqual([
    { uri: 'content://a/1', name: 'a.pdf' },
    { uri: 'content://a/2', name: 'x%20y.jpg' },
  ]);
});

test('returns [] when the API rejects or off Android', async () => {
  getPayloads.mockRejectedValue(new Error('boom'));
  expect(await readSharedFiles()).toEqual([]);
  Platform.OS = 'ios';
  getPayloads.mockResolvedValue([{ contentType: 'file', contentUri: 'file:///a', value: '' }]);
  expect(await readSharedFiles()).toEqual([]);
});

test('clearSharedFiles clears payloads', () => {
  clearSharedFiles();
  expect(Sharing.clearSharedPayloads).toHaveBeenCalled();
});

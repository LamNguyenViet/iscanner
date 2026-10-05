import { deleteFiles } from '../../src/native/deleteFiles';

const mockDelete = jest.fn();
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ delete: () => mockDelete(uri) })),
}));

test('deletes every file and ignores failures', async () => {
  mockDelete.mockImplementationOnce(() => {
    throw new Error('missing');
  });
  await expect(deleteFiles(['file:///a.jpg', 'file:///b.jpg'])).resolves.toBeUndefined();
  expect(mockDelete).toHaveBeenCalledWith('file:///a.jpg');
  expect(mockDelete).toHaveBeenCalledWith('file:///b.jpg');
});

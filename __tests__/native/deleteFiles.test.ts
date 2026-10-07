import { deleteFiles } from '../../src/native/deleteFiles';
import { log } from '../../src/logging/logger';

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

test('logs a warning for a file it could not delete', async () => {
  mockDelete.mockImplementationOnce(() => {
    throw new Error('missing');
  });
  await deleteFiles(['file:///a.jpg']);
  expect(log.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cause: expect.any(Error) }));
});

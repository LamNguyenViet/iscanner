import { Alert } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import Merge from '../../app/merge';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';
import { pickPdfs } from '../../src/native/pickPdfs';
import { createMergedDocument, loadPickedPdfs } from '../../src/workflows/mergeWorkflow';

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));
jest.mock('../../src/native/pickPdfs', () => ({ pickPdfs: jest.fn() }));
jest.mock('../../src/native/readBytes', () => ({ readBytes: jest.fn() }));
jest.mock('../../src/workflows/mergeWorkflow', () => ({
  loadPickedPdfs: jest.fn(),
  createMergedDocument: jest.fn(),
}));
jest.mock('react-native-draggable-flatlist', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FlatList } = require('react-native');
  return {
    __esModule: true,
    default: ({ renderItem, ...rest }: any) => (
      <FlatList
        {...rest}
        renderItem={({ item }: any) => renderItem({ item, drag: jest.fn(), isActive: false })}
      />
    ),
  };
});

const mockPick = pickPdfs as jest.Mock;
const mockLoad = loadPickedPdfs as jest.Mock;
const mockMerge = createMergedDocument as jest.Mock;

const a = { uri: 'file:///a.pdf', name: 'a.pdf', pageCount: 2 };
const b = { uri: 'file:///b.pdf', name: 'b.pdf', pageCount: 3 };

async function renderMerge() {
  const store = createLibraryStore({ fs: createMemoryFs(), newId: () => 'id1' });
  await render(
    <LibraryProvider store={store}>
      <Merge />
    </LibraryProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('goes back when pick is cancelled', async () => {
  mockPick.mockResolvedValueOnce([]);
  await renderMerge();
  expect(mockBack).toHaveBeenCalled();
});

test('disables merge with one file', async () => {
  mockPick.mockResolvedValueOnce([{ uri: a.uri, name: a.name }]);
  mockLoad.mockResolvedValueOnce({ loaded: [a], failed: [] });
  await renderMerge();
  expect(screen.getByText('Chọn ít nhất 2 file PDF')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Gộp PDF' })).toBeDisabled();
});

test('reports failed files', async () => {
  mockPick.mockResolvedValueOnce([{ uri: a.uri, name: a.name }]);
  mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: ['x.pdf'] });
  await renderMerge();
  expect(alertSpy).toHaveBeenCalledWith('Không đọc được file', expect.stringContaining('x.pdf'));
  expect(screen.getByText('a.pdf')).toBeTruthy();
  expect(screen.getByText('b.pdf')).toBeTruthy();
});

test('merges and opens viewer', async () => {
  mockPick.mockResolvedValueOnce([{ uri: a.uri, name: a.name }]);
  mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [] });
  mockMerge.mockResolvedValueOnce({ id: 'id1' });
  await renderMerge();
  await fireEvent.press(screen.getByText('Gộp PDF'));
  expect(mockMerge).toHaveBeenCalledWith(expect.anything(), [a, b], expect.any(String));
  expect(mockReplace).toHaveBeenCalledWith('/viewer/id1');
});

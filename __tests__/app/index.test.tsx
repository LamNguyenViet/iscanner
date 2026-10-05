import { act, render, screen, fireEvent } from '@testing-library/react-native';
import Home from '../../app/index';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(() => cb(), []);
  },
}));

async function renderHome(withDoc: boolean) {
  const store = createLibraryStore({ fs: createMemoryFs(), newId: () => 'id1' });
  if (withDoc) {
    await store.add(new Uint8Array(1536), { name: 'Hoa don', pageCount: 3, source: 'scan' });
  }
  await render(
    <LibraryProvider store={store}>
      <Home />
    </LibraryProvider>,
  );
  // let the provider load and the focus refresh settle inside act
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => mockPush.mockClear());

test('shows empty state', async () => {
  await renderHome(false);
  expect(
    await screen.findByText('Chưa có tài liệu nào. Hãy scan hoặc gộp PDF để bắt đầu.'),
  ).toBeTruthy();
});

test('lists documents with meta', async () => {
  await renderHome(true);
  expect(await screen.findByText('Hoa don')).toBeTruthy();
  expect(screen.getByText(/3 trang/)).toBeTruthy();
  expect(screen.getByText(/1\.5 KB/)).toBeTruthy();
});

test('navigates', async () => {
  await renderHome(true);
  await fireEvent.press(screen.getByText('Scan tài liệu'));
  expect(mockPush).toHaveBeenCalledWith('/scan');
  await fireEvent.press(screen.getByText('Gộp PDF'));
  expect(mockPush).toHaveBeenCalledWith('/merge');
  await fireEvent.press(screen.getByText('Hoa don'));
  expect(mockPush).toHaveBeenCalledWith('/viewer/id1');
});

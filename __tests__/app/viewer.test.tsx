import { act, render, screen, fireEvent } from '@testing-library/react-native';
import Viewer from '../../app/viewer/[id]';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';

const mockBack = jest.fn();
let mockParams: { id: string } = { id: 'id1' };
let mockHeaderRight: (() => React.ReactNode) | undefined;
jest.mock('expo-router', () => ({
  router: { back: () => mockBack() },
  useLocalSearchParams: () => mockParams,
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) => {
      mockHeaderRight = options?.headerRight;
      return null;
    },
  },
}));

const mockPdfProps = jest.fn();
jest.mock('react-native-pdf', () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockPdfProps(props);
    return null;
  },
}));

const mockShare = jest.fn();
jest.mock('../../src/native/share', () => ({
  shareDocument: (...args: unknown[]) => mockShare(...args),
}));

async function renderViewer() {
  const store = createLibraryStore({ fs: createMemoryFs(), newId: () => 'id1' });
  const doc = await store.add(new Uint8Array(10), { name: 'Hoa don', pageCount: 1, source: 'scan' });
  await render(
    <LibraryProvider store={store}>
      <Viewer />
    </LibraryProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { store, doc };
}

beforeEach(() => {
  mockParams = { id: 'id1' };
  mockHeaderRight = undefined;
  mockPdfProps.mockClear();
  mockShare.mockReset();
  mockShare.mockResolvedValue(undefined);
  mockBack.mockClear();
});

test('shows not-found for unknown id', async () => {
  mockParams = { id: 'nope' };
  await renderViewer();
  expect(await screen.findByText('Không tìm thấy tài liệu')).toBeTruthy();
  await fireEvent.press(screen.getByText('Quay lại'));
  expect(mockBack).toHaveBeenCalled();
});

test('renders pdf for known id and shares it', async () => {
  const { store, doc } = await renderViewer();
  const uri = store.fileUri(doc);
  expect(mockPdfProps).toHaveBeenCalledWith(
    expect.objectContaining({ source: { uri } }),
  );
  expect(mockHeaderRight).toBeDefined();
  await render(<>{mockHeaderRight!()}</>);
  await fireEvent.press(screen.getByText('Chia sẻ'));
  expect(mockShare).toHaveBeenCalledWith(uri);
});

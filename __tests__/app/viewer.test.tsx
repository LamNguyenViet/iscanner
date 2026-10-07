import { Alert } from 'react-native';
import { ShareError } from '../../src/errors/AppError';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import Viewer from '../../app/viewer/[id]';
import { LocaleProvider } from '../../src/i18n/LocaleContext';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';
import { log } from '../../src/logging/logger';
import { settleTheme, styleOf, themed } from '../fixtures/theme';

const mockBack = jest.fn();
let mockLocales = [{ languageCode: 'en', languageTag: 'en-US' }];
jest.mock('expo-localization', () => ({ useLocales: () => mockLocales }));
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

let mockColorScheme = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme,
}));

async function renderViewer(dark = false) {
  const store = createLibraryStore({ fs: createMemoryFs(), newId: () => 'id1' });
  const doc = await store.add(new Uint8Array(10), { name: 'Hoa don', pageCount: 1, source: 'scan' });
  const ui = (
    <LibraryProvider store={store}>
      <Viewer />
    </LibraryProvider>
  );
  mockColorScheme = dark ? 'dark' : 'light';
  await render(dark ? themed(ui) : ui);
  await settleTheme();
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
  expect(mockShare).toHaveBeenCalledWith(uri, 'Hoa don');
  expect(log.info).toHaveBeenCalledWith('document.shared');
});

test('a share failure shows the SHARE popup', async () => {
  await renderViewer();
  mockShare.mockRejectedValueOnce(new ShareError());
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<>{mockHeaderRight!()}</>);
  await fireEvent.press(screen.getByText('Chia sẻ'));
  expect(alertSpy).toHaveBeenCalledWith(
    'Không chia sẻ được',
    'Không mở được bảng chia sẻ, vui lòng thử lại.\n\nMã lỗi: SHARE',
    undefined,
  );
  alertSpy.mockRestore();
});

test('refreshes once when the id is not loaded yet', async () => {
  const store = createLibraryStore({ fs: createMemoryFs(), newId: () => 'id1' });
  await store.add(new Uint8Array(10), { name: 'Hoa don', pageCount: 1, source: 'scan' });
  // the provider's initial load misses the document (e.g. created right before navigating)
  const listSpy = jest.spyOn(store, 'list').mockResolvedValueOnce([]);
  await render(
    <LibraryProvider store={store}>
      <Viewer />
    </LibraryProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(listSpy).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Không tìm thấy tài liệu')).toBeNull();
  expect(mockPdfProps).toHaveBeenCalled();
});

test('shows an error when the pdf cannot be opened', async () => {
  await renderViewer();
  const { onError } = mockPdfProps.mock.calls.at(-1)![0];
  await act(async () => onError(new Error('corrupt')));
  expect(screen.getByText('Không mở được tài liệu')).toBeTruthy();
});

test('dark theme: viewer background', async () => {
  await renderViewer(true);
  expect(styleOf(screen.root!).backgroundColor).toBe('#121212');
});

test('dark theme: the PDF view background around the pages is dark', async () => {
  await renderViewer(true);
  const props = mockPdfProps.mock.calls.at(-1)![0] as { style: unknown };
  expect(styleOf({ props }).backgroundColor).toBe('#121212');
});

test('re-rendering the screen does not reload the PDF view (react-native-pdf leak #1046)', async () => {
  const { store } = await renderViewer();
  const calls = mockPdfProps.mock.calls.length;
  await screen.rerender(
    <LibraryProvider store={store}>
      <Viewer />
    </LibraryProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(mockPdfProps.mock.calls.length).toBe(calls);
});

describe('English', () => {
  const english = (store: ReturnType<typeof createLibraryStore>) => (
    <LocaleProvider fs={createMemoryFs()}>
      <LibraryProvider store={store}>
        <Viewer />
      </LibraryProvider>
    </LocaleProvider>
  );
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

  test('not-found text and back button', async () => {
    mockParams = { id: 'nope' };
    const store = createLibraryStore({ fs: createMemoryFs(), newId: () => 'id1' });
    await render(english(store));
    await settle();
    expect(await screen.findByText('Document not found')).toBeTruthy();
    await fireEvent.press(screen.getByText('Go back'));
    expect(mockBack).toHaveBeenCalled();
  });

  test('share header button and pdf error', async () => {
    const store = createLibraryStore({ fs: createMemoryFs(), newId: () => 'id1' });
    await store.add(new Uint8Array(10), { name: 'Hoa don', pageCount: 1, source: 'scan' });
    await render(english(store));
    await settle();
    const { onError } = mockPdfProps.mock.calls.at(-1)![0];
    await act(async () => onError(new Error('corrupt')));
    expect(screen.getByText('Could not open the document')).toBeTruthy();
    await render(<LocaleProvider fs={createMemoryFs()}>{mockHeaderRight!()}</LocaleProvider>);
    expect(screen.getByText('Share')).toBeTruthy();
  });
});

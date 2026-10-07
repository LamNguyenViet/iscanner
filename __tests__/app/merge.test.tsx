import { Alert } from 'react-native';
import { PdfEncryptedError, PdfLoadError, StorageError } from '../../src/errors/AppError';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import Merge from '../../app/merge';
import { LocaleProvider } from '../../src/i18n/LocaleContext';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';
import { deleteFiles } from '../../src/native/deleteFiles';
import { clearPending, setPending } from '../../src/share/incomingStore';
import { pickPdfs } from '../../src/native/pickPdfs';
import { hasPendingImages } from '../../src/share/incomingStore';
import { createMergedDocument, loadPickedPdfs } from '../../src/workflows/mergeWorkflow';
import { settleTheme, styleOf, themed } from '../fixtures/theme';

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 0 }));
jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));
jest.mock('../../src/native/pickPdfs', () => ({ pickPdfs: jest.fn() }));
jest.mock('../../src/native/readBytes', () => ({ readBytes: jest.fn() }));
jest.mock('../../src/native/deleteFiles', () => ({
  deleteFiles: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/workflows/mergeWorkflow', () => ({
  loadPickedPdfs: jest.fn(),
  createMergedDocument: jest.fn(),
}));
const mockDraggableProps = jest.fn();
jest.mock('react-native-draggable-flatlist', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FlatList } = require('react-native');
  return {
    __esModule: true,
    default: ({ renderItem, containerStyle, ...rest }: any) => (
      mockDraggableProps({ containerStyle }),
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
const mockDeleteFiles = deleteFiles as jest.Mock;
const mockLog = jest.requireMock('../../src/logging/logger').log;

const a = { uri: 'file:///a.pdf', name: 'a.pdf', pageCount: 2 };
const b = { uri: 'file:///b.pdf', name: 'b.pdf', pageCount: 3 };

let mockLocales = [{ languageCode: 'en', languageTag: 'en-US' }];
jest.mock('expo-localization', () => ({ useLocales: () => mockLocales }));

let mockColorScheme = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme,
}));

async function renderMerge(dark = false, english = false) {
  const store = createLibraryStore({ fs: createMemoryFs(), newId: () => 'id1' });
  let ui = (
    <LibraryProvider store={store}>
      <Merge />
    </LibraryProvider>
  );
  if (english) ui = <LocaleProvider fs={createMemoryFs()}>{ui}</LocaleProvider>;
  mockColorScheme = dark ? 'dark' : 'light';
  await render(dark ? themed(ui) : ui);
  await settleTheme();
}

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  clearPending();
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
  mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [new PdfLoadError({ fileName: 'x.pdf' })] });
  await renderMerge();
  expect(alertSpy).toHaveBeenCalledWith(
    'Không load được file',
    'x.pdf\nKhông load được file, vui lòng kiểm tra lại định dạng file PDF.\n\nMã lỗi: PDF_LOAD',
    undefined,
  );
  expect(screen.getByText('a.pdf')).toBeTruthy();
  expect(screen.getByText('b.pdf')).toBeTruthy();
});

test('one encrypted and one corrupt file give one list popup titled for the first', async () => {
  mockPick.mockResolvedValueOnce([{ uri: a.uri, name: a.name }]);
  mockLoad.mockResolvedValueOnce({
    loaded: [a, b],
    failed: [new PdfEncryptedError({ fileName: 'e.pdf' }), new PdfLoadError({ fileName: 'x.pdf' })],
  });
  await renderMerge();
  expect(alertSpy).toHaveBeenCalledTimes(1);
  expect(alertSpy).toHaveBeenCalledWith(
    'File PDF có mật khẩu',
    'e.pdf — có mật khẩu\nx.pdf — sai định dạng\n\nMã lỗi: PDF_ENCRYPTED',
    undefined,
  );
});

test('a pick failure with a plain Error shows the UNKNOWN popup and goes back', async () => {
  mockPick.mockRejectedValueOnce(new Error('picker crashed'));
  await renderMerge();
  expect(alertSpy).toHaveBeenCalledWith(
    'Có lỗi xảy ra',
    'Đã có lỗi không mong muốn, vui lòng thử lại.\n\nMã lỗi: UNKNOWN',
    undefined,
  );
  expect(mockBack).toHaveBeenCalled();
});

test('a merge failure shows the UNKNOWN popup, a StorageError the STORAGE popup', async () => {
  mockPick.mockResolvedValue([{ uri: a.uri, name: a.name }]);
  mockLoad.mockResolvedValue({ loaded: [a, b], failed: [] });
  mockMerge.mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce(new StorageError());
  await renderMerge();
  await fireEvent.press(screen.getByText('Gộp PDF'));
  expect(alertSpy).toHaveBeenLastCalledWith(
    'Có lỗi xảy ra',
    'Đã có lỗi không mong muốn, vui lòng thử lại.\n\nMã lỗi: UNKNOWN',
    undefined,
  );
  await fireEvent.press(screen.getByText('Gộp PDF'));
  expect(alertSpy).toHaveBeenLastCalledWith(
    'Không lưu được tài liệu',
    'Không lưu được tài liệu. Hãy kiểm tra dung lượng trống của máy.\n\nMã lỗi: STORAGE',
    undefined,
  );
});

test('merges and opens viewer', async () => {
  mockPick.mockResolvedValueOnce([{ uri: a.uri, name: a.name }]);
  mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [] });
  mockMerge.mockResolvedValueOnce({ id: 'id1' });
  await renderMerge();
  await fireEvent.press(screen.getByText('Gộp PDF'));
  expect(mockMerge).toHaveBeenCalledWith(expect.anything(), [a, b], expect.any(String));
  expect(mockReplace).toHaveBeenCalledWith('/viewer/id1');
  expect(mockLog.info).toHaveBeenCalledWith('merge.created', { files: 2, pages: 5 });
});

test('file list is flex-constrained so the action row stays on screen', async () => {
  mockPick.mockResolvedValueOnce([{ uri: a.uri, name: a.name }]);
  mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [] });
  await renderMerge();
  const { containerStyle } = mockDraggableProps.mock.calls.at(-1)![0];
  expect(containerStyle).toEqual(expect.objectContaining({ flex: 1 }));
});

describe('picked file cleanup', () => {
  test('deletes the copy of a removed file', async () => {
    mockPick.mockResolvedValueOnce([{ uri: a.uri, name: a.name }, { uri: b.uri, name: b.name }]);
    mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [] });
    await renderMerge();
    await fireEvent.press(screen.getAllByText('Xoá')[0]);
    expect(mockDeleteFiles).toHaveBeenCalledWith([a.uri]);
    expect(screen.queryByText('a.pdf')).toBeNull();
  });

  test('deletes copies of files that failed to load', async () => {
    mockPick.mockResolvedValueOnce([
      { uri: a.uri, name: a.name },
      { uri: 'file:///x.pdf', name: 'x.pdf' },
    ]);
    mockLoad.mockResolvedValueOnce({ loaded: [a], failed: [new PdfLoadError({ fileName: 'x.pdf' })] });
    await renderMerge();
    expect(mockDeleteFiles).toHaveBeenCalledWith(['file:///x.pdf']);
  });

  test('deletes all copies after a successful merge', async () => {
    mockPick.mockResolvedValueOnce([{ uri: a.uri, name: a.name }, { uri: b.uri, name: b.name }]);
    mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [] });
    mockMerge.mockResolvedValueOnce({ id: 'id1' });
    await renderMerge();
    await fireEvent.press(screen.getByText('Gộp PDF'));
    expect(mockDeleteFiles).toHaveBeenCalledWith([a.uri, b.uri]);
    await screen.unmount();
    expect(mockDeleteFiles).toHaveBeenCalledTimes(1);
  });

  test('deletes remaining copies when leaving without merging', async () => {
    mockPick.mockResolvedValueOnce([{ uri: a.uri, name: a.name }, { uri: b.uri, name: b.name }]);
    mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [] });
    await renderMerge();
    expect(mockDeleteFiles).not.toHaveBeenCalled();
    await screen.unmount();
    expect(mockDeleteFiles).toHaveBeenCalledWith([a.uri, b.uri]);
  });
});

describe('layout', () => {
  test('name input does not grab focus (keyboard would cover the buttons)', async () => {
    mockPick.mockResolvedValueOnce([{ uri: a.uri, name: a.name }]);
    mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [] });
    await renderMerge();
    expect(screen.getByLabelText('Tên tài liệu').props.autoFocus).toBeFalsy();
  });

  test('action row clears the bottom safe area', async () => {
    mockPick.mockResolvedValueOnce([{ uri: a.uri, name: a.name }]);
    mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [] });
    await renderMerge();
    expect(screen.getByTestId('actions')).toHaveStyle({ paddingBottom: 16 + 34 });
  });
});

describe('received files', () => {
  const inc = (name: string, kind: 'pdf' | 'image') => ({
    uri: 'file:///' + name,
    name,
    kind,
    size: 1,
  });

  test('uses pending pdfs instead of picker', async () => {
    setPending({ pdfs: [inc('a.pdf', 'pdf'), inc('b.pdf', 'pdf')], images: [] });
    mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [] });
    await renderMerge();
    expect(mockPick).not.toHaveBeenCalled();
    expect(mockLoad).toHaveBeenCalledWith(expect.anything(), [
      { uri: 'file:///a.pdf', name: 'a.pdf' },
      { uri: 'file:///b.pdf', name: 'b.pdf' },
    ]);
    expect(screen.getByText('a.pdf')).toBeTruthy();
    expect(screen.getByText('b.pdf')).toBeTruthy();
  });

  test('goes back when all pending pdfs fail to load', async () => {
    setPending({ pdfs: [inc('x.pdf', 'pdf')], images: [] });
    mockLoad.mockResolvedValueOnce({ loaded: [], failed: [new PdfLoadError({ fileName: 'x.pdf' })] });
    await renderMerge();
    expect(mockPick).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });

  test('merge with pending images continues to scan', async () => {
    setPending({ pdfs: [inc('a.pdf', 'pdf'), inc('b.pdf', 'pdf')], images: [inc('i.jpg', 'image')] });
    mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [] });
    mockMerge.mockResolvedValueOnce({ id: 'id1' });
    await renderMerge();
    await fireEvent.press(screen.getByText('Gộp PDF'));
    expect(mockReplace).toHaveBeenCalledWith('/scan');
    expect(mockReplace).not.toHaveBeenCalledWith('/viewer/id1');
  });

  test('all pending pdfs failing with images pending continues to scan', async () => {
    setPending({ pdfs: [inc('x.pdf', 'pdf')], images: [inc('i.jpg', 'image')] });
    mockLoad.mockResolvedValueOnce({ loaded: [], failed: [new PdfLoadError({ fileName: 'x.pdf' })] });
    await renderMerge();
    expect(mockReplace).toHaveBeenCalledWith('/scan');
    expect(mockBack).not.toHaveBeenCalled();
    await screen.unmount();
    expect(hasPendingImages()).toBe(true);
  });

  test('unmounting without merging deletes pending images', async () => {
    setPending({ pdfs: [inc('a.pdf', 'pdf'), inc('b.pdf', 'pdf')], images: [inc('i.jpg', 'image')] });
    mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [] });
    await renderMerge();
    await screen.unmount();
    expect(mockDeleteFiles).toHaveBeenCalledWith(['file:///i.jpg']);
    expect(hasPendingImages()).toBe(false);
  });

  test('a later picker merge goes to the viewer, not scan', async () => {
    setPending({ pdfs: [inc('a.pdf', 'pdf'), inc('b.pdf', 'pdf')], images: [inc('i.jpg', 'image')] });
    mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [] });
    await renderMerge();
    await screen.unmount();
    mockPick.mockResolvedValueOnce([{ uri: a.uri, name: a.name }]);
    mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [] });
    mockMerge.mockResolvedValueOnce({ id: 'id1' });
    await renderMerge();
    await fireEvent.press(screen.getByText('Gộp PDF'));
    expect(mockReplace).toHaveBeenCalledWith('/viewer/id1');
    expect(mockReplace).not.toHaveBeenCalledWith('/scan');
  });
});

test('dark theme: screen, file row and buttons', async () => {
  mockPick.mockResolvedValueOnce([{ uri: a.uri, name: a.name }]);
  mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [] });
  await renderMerge(true);
  expect(styleOf(screen.root!).backgroundColor).toBe('#121212');
  let row = screen.getByText('a.pdf').parent;
  while (row && styleOf(row).flexDirection !== 'row') row = row.parent;
  expect(styleOf(row!).backgroundColor).toBe('#1e1e1e');
  expect(styleOf(screen.getByText('a.pdf')).color).toBe('#e8e8e8');
  expect(styleOf(screen.getByText('2 trang')).color).toBe('#a0a0a0');
  expect(styleOf(screen.getByRole('button', { name: 'Gộp PDF' })).backgroundColor).toBe('#4c8dff');
  jest.restoreAllMocks();
});

describe('English', () => {
  test('hint, buttons, page count and default name', async () => {
    mockPick.mockResolvedValueOnce([{ uri: a.uri, name: a.name }]);
    mockLoad.mockResolvedValueOnce({ loaded: [a], failed: [] });
    await renderMerge(false, true);
    expect(screen.getByText('Select at least 2 PDF files')).toBeTruthy();
    expect(screen.getByText('+ Add files')).toBeTruthy();
    expect(screen.getByText('2 pages')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Merge PDF' })).toBeDisabled();
  });

  test('merge uses the English default name', async () => {
    mockPick.mockResolvedValueOnce([{ uri: a.uri, name: a.name }]);
    mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [] });
    mockMerge.mockResolvedValueOnce({ id: 'id1' });
    await renderMerge(false, true);
    await fireEvent.press(screen.getByRole('button', { name: 'Merge PDF' }));
    expect(mockMerge).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.stringMatching(/^Merge /),
    );
  });

  test('failed files alert', async () => {
    mockPick.mockResolvedValueOnce([{ uri: a.uri, name: a.name }]);
    mockLoad.mockResolvedValueOnce({ loaded: [a, b], failed: [new PdfLoadError({ fileName: 'x.pdf' })] });
    await renderMerge(false, true);
    expect(alertSpy).toHaveBeenCalledWith(
      'Cannot load file',
      "x.pdf\nCannot load file, check your document's format file PDF.\n\nError code: PDF_LOAD",
      undefined,
    );
  });
});

describe('nameless shared PDFs', () => {
  const nameless = { uri: 'file:///n.pdf', name: '', kind: 'pdf' as const, size: 1 };

  test('English shows Document in the row and in the failed list', async () => {
    setPending({ pdfs: [nameless, nameless], images: [] });
    mockLoad.mockResolvedValueOnce({
      loaded: [{ uri: 'file:///n.pdf', name: '', pageCount: 2 }],
      failed: [new PdfLoadError(), new PdfLoadError({ fileName: 'x.pdf' })],
    });
    await renderMerge(false, true);
    expect(screen.getByText('Document')).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledWith(
      'Cannot load file',
      'Document — invalid format\nx.pdf — invalid format\n\nError code: PDF_LOAD',
      undefined,
    );
  });

  test('Vietnamese default shows Tài liệu', async () => {
    setPending({ pdfs: [nameless], images: [] });
    mockLoad.mockResolvedValueOnce({
      loaded: [{ uri: 'file:///n.pdf', name: '', pageCount: 2 }],
      failed: [],
    });
    await renderMerge();
    expect(screen.getByText('Tài liệu')).toBeTruthy();
  });
});

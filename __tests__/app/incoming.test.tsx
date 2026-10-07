import { Alert, AppState, type AppStateStatus } from 'react-native';
import {
  FileTooLargeError,
  PdfLoadError,
  StorageError,
  UnsupportedFileError,
} from '../../src/errors/AppError';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import Incoming from '../../app/incoming';
import { LocaleProvider } from '../../src/i18n/LocaleContext';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';
import { SETTINGS_PATH } from '../../src/settings/settings';
import type { LibraryStore } from '../../src/library/types';
import { deleteFiles } from '../../src/native/deleteFiles';
import { readBytes } from '../../src/native/readBytes';
import { clearSharedFiles, hasSharedFiles, readSharedFiles } from '../../src/native/sharedPayloads';
import { getPdfPageCount } from '../../src/pdf/mergePdfs';
import { importIncoming } from '../../src/share/importIncoming';
import {
  clearPending,
  hasPendingImages,
  setPending,
  takeImages,
  takePdfs,
} from '../../src/share/incomingStore';
import type { IncomingFile } from '../../src/share/types';
import { settleTheme, styleOf, themed } from '../fixtures/theme';

const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
let mockParams: { uri?: string } = {};
let mockOptions: { headerLeft?: (props: object) => React.ReactNode } | undefined;
jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    dismissTo: (...args: unknown[]) => mockDismissTo(...args),
  },
  useLocalSearchParams: () => mockParams,
  Stack: {
    Screen: ({ options }: { options?: typeof mockOptions }) => {
      mockOptions = options;
      return null;
    },
  },
}));
jest.mock('expo-router/react-navigation', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require('react-native');
  return {
    HeaderBackButton: ({ onPress }: { onPress: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>header-back</Text>
      </Pressable>
    ),
  };
});
jest.mock('../../src/native/sharedPayloads', () => ({
  readSharedFiles: jest.fn(),
  clearSharedFiles: jest.fn(),
  hasSharedFiles: jest.fn(),
}));
jest.mock('../../src/share/importIncoming', () => ({ importIncoming: jest.fn() }));
jest.mock('../../src/native/deleteFiles', () => ({
  deleteFiles: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/native/readBytes', () => ({ readBytes: jest.fn() }));
jest.mock('../../src/pdf/mergePdfs', () => ({ getPdfPageCount: jest.fn() }));

const mockReadShared = readSharedFiles as jest.Mock;
const mockClearShared = clearSharedFiles as jest.Mock;
const mockHasShared = hasSharedFiles as jest.Mock;
const mockImport = importIncoming as jest.Mock;
const mockDeleteFiles = deleteFiles as jest.Mock;
const mockReadBytes = readBytes as jest.Mock;
const mockPageCount = getPdfPageCount as jest.Mock;
const mockLog = jest.requireMock('../../src/logging/logger').log;

const file = (name: string, kind: 'pdf' | 'image'): IncomingFile => ({
  uri: `file:///cache/incoming/${name}`,
  name,
  kind,
  size: 10,
});
const pdf = file('hop-dong.pdf', 'pdf');
const pdf2 = file('b.pdf', 'pdf');
const img = file('a.jpg', 'image');

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

// Unmounts the incoming screen even after another tree (e.g. the header button) was rendered.
let unmountIncoming: () => unknown = () => {};

let mockLocales = [{ languageCode: 'en', languageTag: 'en-US' }];
jest.mock('expo-localization', () => ({ useLocales: () => mockLocales }));

let mockColorScheme = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme,
}));

async function renderIncoming(dark = false, english = false): Promise<LibraryStore> {
  const store = createLibraryStore({ fs: createMemoryFs(), newId: () => 'id1' });
  let ui = (
    <LibraryProvider store={store}>
      <Incoming />
    </LibraryProvider>
  );
  if (english) ui = <LocaleProvider fs={createMemoryFs()}>{ui}</LocaleProvider>;
  mockColorScheme = dark ? 'dark' : 'light';
  const view = await render(dark ? themed(ui) : ui);
  await settleTheme();
  unmountIncoming = view.unmount;
  await flush();
  await flush();
  return store;
}

let alertSpy: jest.SpyInstance;
let appStateHandler: ((s: AppStateStatus) => void) | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  mockHasShared.mockReturnValue(false);
  appStateHandler = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, h) => {
    appStateHandler = h as (s: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  clearPending();
  mockParams = {};
  mockOptions = undefined;
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockReadShared.mockResolvedValue([{ uri: 'content://zalo/1', name: 'x' }]);
  mockReadBytes.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  mockPageCount.mockResolvedValue(3);
});

test('none goes home with alert', async () => {
  mockImport.mockResolvedValueOnce({ files: [], skipped: [] });
  await renderIncoming();
  expect(alertSpy).toHaveBeenCalledWith('Không có file PDF hoặc ảnh hợp lệ');
  expect(mockDismissTo).toHaveBeenCalledWith('/');
  expect(mockReplace).not.toHaveBeenCalledWith('/');
});

test('when every file was rejected one per-file popup replaces the no-files alert', async () => {
  mockImport.mockResolvedValueOnce({
    files: [],
    skipped: [
      new UnsupportedFileError({ fileName: 'a.docx' }),
      new FileTooLargeError({ fileName: 'b.mp4' }),
    ],
  });
  await renderIncoming();
  expect(alertSpy).toHaveBeenCalledTimes(1);
  expect(alertSpy).toHaveBeenCalledWith(
    'File không được hỗ trợ',
    'a.docx — không hỗ trợ\nb.mp4 — quá lớn (> 100 MB)\n\nMã lỗi: FILE_UNSUPPORTED',
    undefined,
  );
  expect(mockDismissTo).toHaveBeenCalledWith('/');
});

test('a single rejected file shows its name and the full message', async () => {
  mockImport.mockResolvedValueOnce({
    files: [],
    skipped: [new UnsupportedFileError({ fileName: 'a.docx' })],
  });
  await renderIncoming();
  expect(alertSpy).toHaveBeenCalledTimes(1);
  expect(alertSpy).toHaveBeenCalledWith(
    'File không được hỗ trợ',
    'a.docx\niScanner chỉ nhận file PDF và ảnh JPEG/PNG.\n\nMã lỗi: FILE_UNSUPPORTED',
    undefined,
  );
  expect(mockDismissTo).toHaveBeenCalledWith('/');
});

test('an import failure shows the UNKNOWN popup and goes back to the library', async () => {
  mockImport.mockRejectedValueOnce(new Error('boom'));
  await renderIncoming();
  expect(alertSpy).toHaveBeenCalledWith(
    'Có lỗi xảy ra',
    'Đã có lỗi không mong muốn, vui lòng thử lại.\n\nMã lỗi: UNKNOWN',
    undefined,
  );
  expect(mockDismissTo).toHaveBeenCalledWith('/');
});

test('shows a loading message while importing', async () => {
  mockImport.mockReturnValueOnce(new Promise(() => {}));
  await renderIncoming();
  expect(screen.getByText('Đang nhận file…')).toBeTruthy();
});

test('reads shared payloads, then clears them', async () => {
  mockImport.mockResolvedValueOnce({ files: [img], skipped: [] });
  await renderIncoming();
  expect(mockImport).toHaveBeenCalledWith([{ uri: 'content://zalo/1', name: 'x' }]);
  expect(mockClearShared).toHaveBeenCalled();
});

test('leaving while importing deletes the imported copies and does not navigate', async () => {
  let resolveImport!: (v: unknown) => void;
  mockImport.mockReturnValueOnce(new Promise((r) => (resolveImport = r)));
  await renderIncoming();
  await screen.unmount();
  await act(async () => {
    resolveImport({ files: [img], skipped: [] });
  });
  expect(mockDeleteFiles).toHaveBeenCalledWith([img.uri]);
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockDismissTo).not.toHaveBeenCalled();
});

test('uri param used instead of shared payloads', async () => {
  mockParams = { uri: 'content://p/doc%3A1' };
  mockImport.mockResolvedValueOnce({ files: [img], skipped: [] });
  await renderIncoming();
  expect(mockReadShared).not.toHaveBeenCalled();
  expect(mockImport).toHaveBeenCalledWith([{ uri: 'content://p/doc%3A1' }]);
});

test('some rejected and some usable shows the list popup then continues', async () => {
  mockImport.mockResolvedValueOnce({
    files: [img],
    skipped: [
      new UnsupportedFileError({ fileName: 'a.docx' }),
      new FileTooLargeError({ fileName: 'b.mp4' }),
    ],
  });
  await renderIncoming();
  expect(alertSpy).toHaveBeenCalledTimes(1);
  expect(alertSpy).toHaveBeenCalledWith(
    'File không được hỗ trợ',
    'a.docx — không hỗ trợ\nb.mp4 — quá lớn (> 100 MB)\n\nMã lỗi: FILE_UNSUPPORTED',
    undefined,
  );
  expect(mockReplace).toHaveBeenCalledWith('/scan');
});

test('logs share.received with the counts', async () => {
  mockImport.mockResolvedValueOnce({
    files: [pdf],
    skipped: [new UnsupportedFileError({ fileName: 'a.docx' })],
  });
  await renderIncoming();
  expect(mockLog.info).toHaveBeenCalledWith('share.received', { pdf: 1, image: 0, rejected: 1 });
});

test('images go to scan', async () => {
  mockImport.mockResolvedValueOnce({ files: [img], skipped: [] });
  await renderIncoming();
  expect(mockReplace).toHaveBeenCalledWith('/scan');
  expect(takeImages()).toEqual([img]);
  expect(takePdfs()).toEqual([]);
});

test('two pdfs go to merge', async () => {
  mockImport.mockResolvedValueOnce({ files: [pdf, pdf2, img], skipped: [] });
  await renderIncoming();
  expect(mockReplace).toHaveBeenCalledWith('/merge');
  expect(takePdfs()).toEqual([pdf, pdf2]);
  expect(takeImages()).toEqual([img]);
});

test('new share replaces previous pending files', async () => {
  const old = file('old.jpg', 'image');
  setPending({ pdfs: [], images: [old] });
  mockImport.mockResolvedValueOnce({ files: [img], skipped: [] });
  await renderIncoming();
  expect(mockDeleteFiles).toHaveBeenCalledWith([old.uri]);
  expect(mockDeleteFiles.mock.invocationCallOrder[0]).toBeLessThan(
    mockImport.mock.invocationCallOrder[0],
  );
  expect(takeImages()).toEqual([img]);
});

describe('single pdf', () => {
  test('shows the file name and page count', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf], skipped: [] });
    await renderIncoming();
    expect(screen.getByText('hop-dong')).toBeTruthy();
    expect(screen.getByText('3 trang')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('single pdf save goes to viewer', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf], skipped: [] });
    const store = await renderIncoming();
    await fireEvent.press(screen.getByText('Lưu vào thư viện'));
    await flush();
    const docs = await store.list();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toEqual(
      expect.objectContaining({ id: 'id1', name: 'hop-dong', pageCount: 3, source: 'merge' }),
    );
    expect(mockDeleteFiles).toHaveBeenCalledWith([pdf.uri]);
    expect(mockReplace).toHaveBeenCalledWith('/viewer/id1');
    expect(mockLog.info).toHaveBeenCalledWith('incoming.saved');
  });

  test('single pdf save with pending images goes to scan', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf, img], skipped: [] });
    const store = await renderIncoming();
    await fireEvent.press(screen.getByText('Lưu vào thư viện'));
    await flush();
    expect(await store.list()).toHaveLength(1);
    expect(mockReplace).toHaveBeenCalledWith('/scan');
    expect(hasPendingImages()).toBe(true);
    expect(takeImages()).toEqual([img]);
  });

  test('a save failure shows the STORAGE popup and stays on the confirm view', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf], skipped: [] });
    const store = await renderIncoming();
    jest.spyOn(store, 'add').mockRejectedValueOnce(new StorageError());
    await fireEvent.press(screen.getByText('Lưu vào thư viện'));
    await flush();
    expect(alertSpy).toHaveBeenCalledWith(
      'Không lưu được tài liệu',
      'Không lưu được tài liệu. Hãy kiểm tra dung lượng trống của máy.\n\nMã lỗi: STORAGE',
      undefined,
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('merge with other files', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf, img], skipped: [] });
    await renderIncoming();
    await fireEvent.press(screen.getByText('Gộp với file khác'));
    expect(mockReplace).toHaveBeenCalledWith('/merge');
    expect(takePdfs()).toEqual([pdf]);
    expect(takeImages()).toEqual([img]);
    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });

  test('unreadable pdf gives FILE_READ, goes home and deletes the copy', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf], skipped: [] });
    mockReadBytes.mockRejectedValueOnce(new Error('io'));
    await renderIncoming();
    expect(alertSpy).toHaveBeenCalledWith(
      'Không đọc được file',
      `${pdf.name}\nKhông đọc được file. Hãy mở lại file từ ứng dụng gốc rồi chia sẻ lại.\n\nMã lỗi: FILE_READ`,
      undefined,
    );
    expect(mockDeleteFiles).toHaveBeenCalledWith([pdf.uri]);
    expect(mockDismissTo).toHaveBeenCalledWith('/');
    expect(mockReplace).not.toHaveBeenCalledWith('/');
  });

  test('corrupt pdf alerts and goes home, deleting the copy', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf], skipped: [] });
    mockPageCount.mockRejectedValueOnce(new PdfLoadError({ fileName: pdf.name }));
    await renderIncoming();
    expect(alertSpy).toHaveBeenCalledWith(
      'Không load được file',
      `${pdf.name}\nKhông load được file, vui lòng kiểm tra lại định dạng file PDF.\n\nMã lỗi: PDF_LOAD`,
      undefined,
    );
    expect(mockDeleteFiles).toHaveBeenCalledWith([pdf.uri]);
    expect(mockDismissTo).toHaveBeenCalledWith('/');
    expect(mockReplace).not.toHaveBeenCalledWith('/');
  });

  test('rejected files and a corrupt single pdf share one popup listing both', async () => {
    mockImport.mockResolvedValueOnce({
      files: [pdf],
      skipped: [new UnsupportedFileError({ fileName: 'a.zip' })],
    });
    mockPageCount.mockRejectedValueOnce(new PdfLoadError({ fileName: pdf.name }));
    await renderIncoming();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'File không được hỗ trợ',
      `a.zip — không hỗ trợ\n${pdf.name} — sai định dạng\n\nMã lỗi: FILE_UNSUPPORTED`,
      undefined,
    );
    expect(mockDismissTo).toHaveBeenCalledWith('/');
  });

  test('rejected files with a usable single pdf are shown once', async () => {
    mockImport.mockResolvedValueOnce({
      files: [pdf],
      skipped: [new UnsupportedFileError({ fileName: 'a.zip' })],
    });
    await renderIncoming();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'File không được hỗ trợ',
      'a.zip\niScanner chỉ nhận file PDF và ảnh JPEG/PNG.\n\nMã lỗi: FILE_UNSUPPORTED',
      undefined,
    );
  });

  test('corrupt pdf with images goes to scan', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf, img], skipped: [] });
    mockPageCount.mockRejectedValueOnce(new PdfLoadError({ fileName: pdf.name }));
    await renderIncoming();
    expect(alertSpy).toHaveBeenCalledWith(
      'Không load được file',
      `${pdf.name}\nKhông load được file, vui lòng kiểm tra lại định dạng file PDF.\n\nMã lỗi: PDF_LOAD`,
      undefined,
    );
    expect(mockReplace).toHaveBeenCalledWith('/scan');
    expect(takeImages()).toEqual([img]);
  });

  test('header back cancels: deletes the copy and goes home', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf], skipped: [] });
    await renderIncoming();
    expect(mockOptions?.headerLeft).toBeDefined();
    await render(<>{mockOptions!.headerLeft!({})}</>);
    await fireEvent.press(screen.getByText('header-back'));
    expect(mockDeleteFiles).toHaveBeenCalledWith([pdf.uri]);
    expect(mockDismissTo).toHaveBeenCalledWith('/');
    expect(mockReplace).not.toHaveBeenCalledWith('/');
  });

  test('header back with pending images goes to scan', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf, img], skipped: [] });
    await renderIncoming();
    await render(<>{mockOptions!.headerLeft!({})}</>);
    await fireEvent.press(screen.getByText('header-back'));
    expect(mockDeleteFiles).toHaveBeenCalledWith([pdf.uri]);
    expect(mockReplace).toHaveBeenCalledWith('/scan');
    expect(takeImages()).toEqual([img]);
  });

  test('leaving without a choice deletes the copy', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf], skipped: [] });
    await renderIncoming();
    await screen.unmount();
    expect(mockDeleteFiles).toHaveBeenCalledWith([pdf.uri]);
  });

  test('leaving without a choice also deletes the images waiting for the scan review', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf, img], skipped: [] });
    await renderIncoming();
    await screen.unmount();
    expect(mockDeleteFiles).toHaveBeenCalledWith([pdf.uri, img.uri]);
    expect(hasPendingImages()).toBe(false);
  });

  test('leaving after a choice keeps the images handed on', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf, img], skipped: [] });
    await renderIncoming();
    await fireEvent.press(screen.getByText('Gộp với file khác'));
    await screen.unmount();
    expect(mockDeleteFiles).not.toHaveBeenCalled();
    expect(takeImages()).toEqual([img]);
  });

  test('leaving after cancel keeps the images for the scan review', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf, img], skipped: [] });
    await renderIncoming();
    await render(<>{mockOptions!.headerLeft!({})}</>);
    await fireEvent.press(screen.getByText('header-back'));
    mockDeleteFiles.mockClear();
    await unmountIncoming();
    expect(mockDeleteFiles).not.toHaveBeenCalled();
    expect(takeImages()).toEqual([img]);
  });
});

describe('a new share while the screen is open', () => {
  async function comeToForeground() {
    await act(async () => appStateHandler!('active'));
    await flush();
    await flush();
  }

  test('replaces the file waiting for a choice', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf], skipped: [] });
    await renderIncoming();
    expect(screen.getByText('hop-dong')).toBeTruthy();

    mockHasShared.mockReturnValue(true);
    mockReadShared.mockResolvedValueOnce([{ uri: 'content://files/2', name: 'b.pdf' }]);
    mockImport.mockResolvedValueOnce({ files: [pdf2], skipped: [] });
    await comeToForeground();

    expect(mockDeleteFiles).toHaveBeenCalledWith([pdf.uri]);
    expect(mockImport).toHaveBeenLastCalledWith([{ uri: 'content://files/2', name: 'b.pdf' }]);
    expect(screen.getByText('b')).toBeTruthy();
    expect(screen.queryByText('hop-dong')).toBeNull();
  });

  test('reads the shared files even if the screen was opened from a file URI', async () => {
    mockParams = { uri: 'content://p/doc%3A1' };
    mockImport.mockResolvedValueOnce({ files: [pdf], skipped: [] });
    await renderIncoming();
    expect(mockReadShared).not.toHaveBeenCalled();

    mockHasShared.mockReturnValue(true);
    mockImport.mockResolvedValueOnce({ files: [pdf2], skipped: [] });
    await comeToForeground();
    expect(mockReadShared).toHaveBeenCalledTimes(1);
    expect(screen.getByText('b')).toBeTruthy();
  });

  test('is left alone while the first share is still importing', async () => {
    mockImport.mockReturnValueOnce(new Promise(() => {}));
    await renderIncoming();
    mockHasShared.mockReturnValue(true);
    await comeToForeground();
    expect(mockReadShared).toHaveBeenCalledTimes(1);
  });

  test('returning to the foreground with nothing shared changes nothing', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf], skipped: [] });
    await renderIncoming();
    await comeToForeground();
    expect(mockReadShared).toHaveBeenCalledTimes(1);
    expect(mockDeleteFiles).not.toHaveBeenCalled();
    expect(screen.getByText('hop-dong')).toBeTruthy();
  });
});

describe('dark theme', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('single-pdf confirm view uses the dark palette', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf], skipped: [] });
    await renderIncoming(true);
    expect(styleOf(screen.root!).backgroundColor).toBe('#121212');
    expect(styleOf(screen.getByText('hop-dong')).color).toBe('#e8e8e8');
    expect(styleOf(screen.getByText('3 trang')).color).toBe('#a0a0a0');
    const secondary = screen.getByRole('button', { name: 'Gộp với file khác' });
    expect(styleOf(secondary)).toMatchObject({ backgroundColor: '#1e1e1e', borderColor: '#4c8dff' });
    expect(styleOf(screen.getByText('Gộp với file khác')).color).toBe('#4c8dff');
    expect(styleOf(screen.getByRole('button', { name: 'Lưu vào thư viện' })).backgroundColor).toBe('#4c8dff');
  });

  test('loading message uses the muted color', async () => {
    mockImport.mockReturnValueOnce(new Promise(() => {}));
    await renderIncoming(true);
    expect(styleOf(screen.getByText('Đang nhận file…')).color).toBe('#a0a0a0');
    expect(styleOf(screen.root!).backgroundColor).toBe('#121212');
  });
});

describe('English', () => {
  test('loading text', async () => {
    mockImport.mockReturnValueOnce(new Promise(() => {}));
    await renderIncoming(false, true);
    expect(screen.getByText('Receiving files…')).toBeTruthy();
  });

  test('nothing usable alert', async () => {
    mockImport.mockResolvedValueOnce({ files: [], skipped: [] });
    await renderIncoming(false, true);
    expect(alertSpy).toHaveBeenCalledWith('No valid PDF or image files');
  });

  test('rejected file alert', async () => {
    mockImport.mockResolvedValueOnce({
      files: [img],
      skipped: [new UnsupportedFileError({ fileName: 'a.docx' })],
    });
    await renderIncoming(false, true);
    expect(alertSpy).toHaveBeenCalledWith(
      'Unsupported file',
      'a.docx\niScanner only accepts PDF files and JPEG/PNG images.\n\nError code: FILE_UNSUPPORTED',
      undefined,
    );
  });

  test('a nameless single PDF is shown and saved as Document', async () => {
    const unnamed = { ...pdf, name: '' };
    mockImport.mockResolvedValueOnce({ files: [unnamed], skipped: [] });
    const store = await renderIncoming(false, true);
    expect(screen.getByText('Document')).toBeTruthy();
    expect(screen.getByText('3 pages')).toBeTruthy();
    expect(screen.getByText('Merge with other files')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save to library'));
    await flush();
    const docs = await store.list();
    expect(docs[0].name).toBe('Document');
  });

  test('a PDF named ".pdf" is shown and saved as Document', async () => {
    const dotPdf = { ...pdf, name: '.pdf' };
    mockImport.mockResolvedValueOnce({ files: [dotPdf], skipped: [] });
    const store = await renderIncoming(false, true);
    expect(screen.getByText('Document')).toBeTruthy();
    expect(screen.queryByText('.pdf')).toBeNull();
    await fireEvent.press(screen.getByText('Save to library'));
    await flush();
    expect((await store.list())[0].name).toBe('Document');
  });

  test('cold start on a vi device with saved English alerts in English', async () => {
    mockLocales = [{ languageCode: 'vi', languageTag: 'vi-VN' }];
    const fs = createMemoryFs();
    await fs.writeText(SETTINGS_PATH, '{"language":"en"}');
    mockImport.mockResolvedValueOnce({ files: [], skipped: [new UnsupportedFileError({ fileName: 'a.docx' })] });
    const store = createLibraryStore({ fs: createMemoryFs(), newId: () => 'id1' });
    await render(
      <LocaleProvider fs={fs}>
        <LibraryProvider store={store}>
          <Incoming />
        </LibraryProvider>
      </LocaleProvider>,
    );
    await flush();
    await flush();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'Unsupported file',
      'a.docx\niScanner only accepts PDF files and JPEG/PNG images.\n\nError code: FILE_UNSUPPORTED',
      undefined,
    );
    mockLocales = [{ languageCode: 'en', languageTag: 'en-US' }];
  });
});

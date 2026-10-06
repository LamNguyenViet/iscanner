import { Alert } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import Incoming from '../../app/incoming';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';
import type { LibraryStore } from '../../src/library/types';
import { deleteFiles } from '../../src/native/deleteFiles';
import { readBytes } from '../../src/native/readBytes';
import { clearSharedFiles, readSharedFiles } from '../../src/native/sharedPayloads';
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

const mockReplace = jest.fn();
let mockParams: { uri?: string } = {};
let mockOptions: { headerLeft?: (props: object) => React.ReactNode } | undefined;
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
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
}));
jest.mock('../../src/share/importIncoming', () => ({ importIncoming: jest.fn() }));
jest.mock('../../src/native/deleteFiles', () => ({
  deleteFiles: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/native/readBytes', () => ({ readBytes: jest.fn() }));
jest.mock('../../src/pdf/mergePdfs', () => ({ getPdfPageCount: jest.fn() }));

const mockReadShared = readSharedFiles as jest.Mock;
const mockClearShared = clearSharedFiles as jest.Mock;
const mockImport = importIncoming as jest.Mock;
const mockDeleteFiles = deleteFiles as jest.Mock;
const mockReadBytes = readBytes as jest.Mock;
const mockPageCount = getPdfPageCount as jest.Mock;

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

async function renderIncoming(): Promise<LibraryStore> {
  const store = createLibraryStore({ fs: createMemoryFs(), newId: () => 'id1' });
  await render(
    <LibraryProvider store={store}>
      <Incoming />
    </LibraryProvider>,
  );
  await flush();
  await flush();
  return store;
}

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
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
  expect(mockReplace).toHaveBeenCalledWith('/');
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
});

test('uri param used instead of shared payloads', async () => {
  mockParams = { uri: 'content://p/doc%3A1' };
  mockImport.mockResolvedValueOnce({ files: [img], skipped: [] });
  await renderIncoming();
  expect(mockReadShared).not.toHaveBeenCalled();
  expect(mockImport).toHaveBeenCalledWith([{ uri: 'content://p/doc%3A1' }]);
});

test('shows skipped count', async () => {
  mockImport.mockResolvedValueOnce({
    files: [img],
    skipped: [
      { name: 'a.docx', reason: 'unsupported' },
      { name: 'b.mp4', reason: 'too-large' },
    ],
  });
  await renderIncoming();
  expect(alertSpy).toHaveBeenCalledWith('Bỏ qua 2 file không hỗ trợ hoặc quá lớn');
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
    expect(screen.getByText('hop-dong.pdf')).toBeTruthy();
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

  test('merge with other files', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf, img], skipped: [] });
    await renderIncoming();
    await fireEvent.press(screen.getByText('Gộp với file khác'));
    expect(mockReplace).toHaveBeenCalledWith('/merge');
    expect(takePdfs()).toEqual([pdf]);
    expect(takeImages()).toEqual([img]);
    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });

  test('corrupt pdf alerts and goes home, deleting the copy', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf], skipped: [] });
    mockPageCount.mockRejectedValueOnce(new Error('ENCRYPTED'));
    await renderIncoming();
    expect(alertSpy).toHaveBeenCalledWith('Không đọc được file');
    expect(mockDeleteFiles).toHaveBeenCalledWith([pdf.uri]);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  test('corrupt pdf with images goes to scan', async () => {
    mockImport.mockResolvedValueOnce({ files: [pdf, img], skipped: [] });
    mockPageCount.mockRejectedValueOnce(new Error('ENCRYPTED'));
    await renderIncoming();
    expect(alertSpy).toHaveBeenCalledWith('Không đọc được file');
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
    expect(mockReplace).toHaveBeenCalledWith('/');
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
});

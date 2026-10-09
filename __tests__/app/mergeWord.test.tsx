import { Alert, Platform } from 'react-native';
import JSZip from 'jszip';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Merge from '../../app/merge';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';
import { deleteFiles } from '../../src/native/deleteFiles';
import { readBytes } from '../../src/native/readBytes';
import { pickDocuments, WORD_MIME_TYPES } from '../../src/native/pickPdfs';
import { PDFDocument } from '../../src/pdf/pdfLib';
import { clearPending } from '../../src/share/incomingStore';
import { makeDocx } from '../fixtures/word';

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 0 }));
jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));
jest.mock('../../src/native/pickPdfs', () => ({
  pickDocuments: jest.fn(),
  WORD_MIME_TYPES: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
}));
jest.mock('../../src/native/readBytes', () => ({ readBytes: jest.fn() }));
jest.mock('../../src/native/deleteFiles', () => ({
  deleteFiles: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/native/printPdf', () => ({
  printHtmlToPdf: jest.fn().mockResolvedValue('file:///cache/converted.pdf'),
}));
jest.mock('../../src/native/officeCryptoNative', () => ({ nativeIteratedHash: jest.fn() }));
jest.mock('expo-localization', () => ({
  useLocales: () => [{ languageCode: 'vi', languageTag: 'vi-VN' }],
}));
jest.mock('react-native-draggable-flatlist', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FlatList } = require('react-native');
  return {
    __esModule: true,
    default: ({ renderItem, containerStyle: _c, ...rest }: any) => (
      <FlatList
        {...rest}
        renderItem={({ item }: any) => renderItem({ item, drag: jest.fn(), isActive: false })}
      />
    ),
  };
});

const mockPick = pickDocuments as jest.Mock;
const mockRead = readBytes as jest.Mock;

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

let files: Record<string, Uint8Array>;
let alertSpy: jest.SpyInstance;

async function pdfOfPages(n: number): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage([100, 100]);
  return d.save();
}

async function renderMerge() {
  const store = createLibraryStore({ fs: createMemoryFs(), newId: () => 'id1' });
  const add = jest.spyOn(store, 'add');
  const view = await render(
    <LibraryProvider store={store}>
      <Merge />
    </LibraryProvider>,
  );
  await settle();
  await settle();
  return { add, view };
}

const deleted = () => (deleteFiles as jest.Mock).mock.calls.flatMap((c) => c[0] as string[]);

beforeAll(async () => {
  const xlsx = new JSZip();
  xlsx.file('xl/workbook.xml', '<x/>');
  files = {
    'file:///a.pdf': await pdfOfPages(1),
    'file:///b.docx': await makeDocx(),
    'file:///sheet.xlsx': new Uint8Array(await xlsx.generateAsync({ type: 'uint8array' })),
    'file:///cache/converted.pdf': await pdfOfPages(3),
  };
});

beforeEach(() => {
  Platform.OS = 'android';
  jest.clearAllMocks();
  clearPending();
  mockRead.mockImplementation(async (uri: string) => files[uri]);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

const both = [
  { uri: 'file:///a.pdf', name: 'a.pdf' },
  { uri: 'file:///b.docx', name: 'b.docx' },
];

test('the picker accepts PDF and Word types', async () => {
  mockPick.mockResolvedValueOnce([]);
  await renderMerge();
  expect(mockPick).toHaveBeenCalledWith(['application/pdf', ...WORD_MIME_TYPES]);
});

test('PDF + DOCX show two rows with original names and pages, and merge into one document', async () => {
  mockPick.mockResolvedValueOnce(both);
  const { add } = await renderMerge();
  expect(await screen.findByText('b.docx', {}, { timeout: 10000 })).toBeTruthy();
  expect(screen.getByText('a.pdf')).toBeTruthy();
  expect(screen.getByText('1 trang')).toBeTruthy();
  expect(screen.getByText('3 trang')).toBeTruthy();
  await fireEvent.press(screen.getByText('Gộp PDF'));
  await settle();
  expect(add).toHaveBeenCalledTimes(1);
  expect(deleted()).toContain('file:///cache/converted.pdf');
  expect(deleted()).toContain('file:///b.docx');
});

test('unmounting deletes the converted copy', async () => {
  mockPick.mockResolvedValueOnce(both);
  const { view } = await renderMerge();
  await screen.findByText('b.docx', {}, { timeout: 10000 });
  await view.unmount();
  expect(deleted()).toContain('file:///cache/converted.pdf');
});

test('a Word file that cannot be converted shows WORD_CONVERT with its name', async () => {
  mockPick.mockResolvedValueOnce([{ uri: 'file:///sheet.xlsx', name: 'sheet.xlsx' }]);
  await renderMerge();
  await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1), { timeout: 10000 });
  const [title, message] = alertSpy.mock.calls[0];
  expect(title).toBe('Không chuyển được file Word');
  expect(message).toContain('sheet.xlsx');
  expect(message).toContain('WORD_CONVERT');
});

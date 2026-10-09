import { Alert, AppState, Platform } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Incoming from '../../app/incoming';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';
import { deleteFiles } from '../../src/native/deleteFiles';
import { readBytes } from '../../src/native/readBytes';
import { hasSharedFiles, readSharedFiles } from '../../src/native/sharedPayloads';
import { PDFDocument } from '../../src/pdf/pdfLib';
import { importIncoming } from '../../src/share/importIncoming';
import { clearPending, takePdfs } from '../../src/share/incomingStore';
import type { IncomingFile } from '../../src/share/types';
import { makeEncryptedDocx } from '../fixtures/word';

const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    dismissTo: (...args: unknown[]) => mockDismissTo(...args),
  },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));
jest.mock('expo-router/react-navigation', () => ({ HeaderBackButton: () => null }));
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
jest.mock('../../src/native/printPdf', () => ({
  printHtmlToPdf: jest.fn().mockResolvedValue('file:///cache/converted.pdf'),
}));
jest.mock('../../src/native/officeCryptoNative', () => {
  const { createHash } = jest.requireActual('crypto');
  return {
    nativeIteratedHash: jest.fn((alg: string, initial: Uint8Array, spin: number) => {
      let h = Buffer.from(initial);
      const it = Buffer.alloc(4);
      for (let i = 0; i < spin; i++) {
        it.writeUInt32LE(i, 0);
        h = createHash(alg.toLowerCase()).update(it).update(h).digest();
      }
      return new Uint8Array(h);
    }),
  };
});
jest.mock('expo-localization', () => ({
  useLocales: () => [{ languageCode: 'vi', languageTag: 'vi-VN' }],
}));

const word: IncomingFile = { uri: 'file:///cache/incoming/rp.docx', name: 'report.docx', kind: 'word', size: 10 };
const CONVERTED = 'file:///cache/converted.pdf';

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

let files: Record<string, Uint8Array>;
let alertSpy: jest.SpyInstance;

async function renderIncoming() {
  const store = createLibraryStore({ fs: createMemoryFs(), newId: () => 'id1' });
  const add = jest.spyOn(store, 'add');
  await render(
    <LibraryProvider store={store}>
      <Incoming />
    </LibraryProvider>,
  );
  await settle();
  await settle();
  return add;
}

async function enter(password: string) {
  await fireEvent.changeText(screen.getByPlaceholderText('Mật khẩu'), password);
  await fireEvent.press(screen.getByText('Mở'));
  await screen.findByText('2 trang', {}, { timeout: 15000 });
}

const deleted = () => (deleteFiles as jest.Mock).mock.calls.flatMap((c) => c[0] as string[]);

beforeAll(async () => {
  const d = await PDFDocument.create();
  d.addPage([100, 100]);
  d.addPage([100, 100]);
  files = { [word.uri]: await makeEncryptedDocx('secret'), [CONVERTED]: await d.save() };
});

beforeEach(() => {
  Platform.OS = 'android';
  jest.clearAllMocks();
  clearPending();
  (hasSharedFiles as jest.Mock).mockReturnValue(false);
  (readSharedFiles as jest.Mock).mockResolvedValue([{ uri: 'content://x/1', name: 'x' }]);
  (importIncoming as jest.Mock).mockResolvedValue({ files: [word], skipped: [] });
  (readBytes as jest.Mock).mockImplementation(async (uri: string) => files[uri]);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(
    () => ({ remove: jest.fn() }) as unknown as ReturnType<typeof AppState.addEventListener>,
  );
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('an encrypted DOCX share prompts, then shows the original name and the page count', async () => {
  await renderIncoming();
  expect(screen.getByText('"report.docx" được bảo vệ bằng mật khẩu.')).toBeTruthy();
  await enter('secret');
  expect(screen.getByText('report')).toBeTruthy();
  expect(screen.getByText('2 trang')).toBeTruthy();
  expect(deleted()).toContain(word.uri);
});

test('Save stores the converted PDF bytes and deletes the converted copy', async () => {
  const add = await renderIncoming();
  await enter('secret');
  await fireEvent.press(screen.getByRole('button', { name: 'Lưu vào thư viện' }));
  await settle();
  await settle();
  expect(add).toHaveBeenCalledTimes(1);
  expect(add.mock.calls[0][0]).toBe(files[CONVERTED]);
  expect(add.mock.calls[0][1]).toMatchObject({ name: 'report', pageCount: 2 });
  expect(deleted()).toContain(CONVERTED);
  expect(mockReplace).toHaveBeenCalledWith('/viewer/id1');
});

test('Merge with other files hands over the converted PDF without a password', async () => {
  await renderIncoming();
  await enter('secret');
  await fireEvent.press(screen.getByRole('button', { name: 'Gộp với file khác' }));
  expect(mockReplace).toHaveBeenCalledWith('/merge');
  expect(takePdfs()).toEqual([{ uri: CONVERTED, name: 'report.docx', kind: 'pdf', size: 10 }]);
});

test('Skip shows the nothing-usable notice and goes home', async () => {
  const add = await renderIncoming();
  await fireEvent.press(screen.getByText('Bỏ qua file này'));
  await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/'));
  expect(alertSpy).toHaveBeenCalledWith('Không có file PDF hoặc ảnh hợp lệ');
  expect(mockDismissTo).toHaveBeenCalledWith('/');
  expect(add).not.toHaveBeenCalled();
  expect(deleted()).toContain(word.uri);
});

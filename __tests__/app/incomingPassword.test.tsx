import { Alert, AppState } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Incoming from '../../app/incoming';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';
import { readBytes } from '../../src/native/readBytes';
import { hasSharedFiles, readSharedFiles } from '../../src/native/sharedPayloads';
import { UnsupportedFileError } from '../../src/errors/AppError';
import { getPdfPageCount } from '../../src/pdf/mergePdfs';
import { importIncoming } from '../../src/share/importIncoming';
import { clearPending, takePdfs } from '../../src/share/incomingStore';
import type { IncomingFile } from '../../src/share/types';
import { makePasswordPdf } from '../fixtures/pdfPassword';

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
jest.mock('expo-localization', () => ({
  useLocales: () => [{ languageCode: 'vi', languageTag: 'vi-VN' }],
}));

const pdf: IncomingFile = { uri: 'file:///cache/incoming/hs.pdf', name: 'hs.pdf', kind: 'pdf', size: 10 };

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

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
  await settle();
  await settle();
}

beforeEach(() => {
  jest.clearAllMocks();
  clearPending();
  (hasSharedFiles as jest.Mock).mockReturnValue(false);
  (readSharedFiles as jest.Mock).mockResolvedValue([{ uri: 'content://x/1', name: 'x' }]);
  (importIncoming as jest.Mock).mockResolvedValue({ files: [pdf], skipped: [] });
  (readBytes as jest.Mock).mockResolvedValue(makePasswordPdf());
  jest.spyOn(AppState, 'addEventListener').mockImplementation(
    () => ({ remove: jest.fn() }) as unknown as ReturnType<typeof AppState.addEventListener>,
  );
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('a single encrypted share shows the prompt, then the confirm view with the page count', async () => {
  await renderIncoming();
  expect(screen.getByText('"hs.pdf" được bảo vệ bằng mật khẩu.')).toBeTruthy();
  await enter('secret');
  expect(screen.getByText('1 trang')).toBeTruthy();
  expect(screen.getByText('hs')).toBeTruthy();
});

test('Save stores bytes that load without a password', async () => {
  const add = await renderIncoming();
  await enter('secret');
  await fireEvent.press(screen.getByRole('button', { name: 'Lưu vào thư viện' }));
  await settle();
  await settle();
  expect(add).toHaveBeenCalledTimes(1);
  const stored = add.mock.calls[0][0] as Uint8Array;
  expect(Buffer.from(stored).toString('latin1')).not.toContain('/Encrypt');
  expect(await getPdfPageCount(stored, 'hs.pdf')).toBe(1);
  expect(mockReplace).toHaveBeenCalledWith('/viewer/id1');
});

test('Skip shows the nothing-usable notice and goes home', async () => {
  const add = await renderIncoming();
  await fireEvent.press(screen.getByText('Bỏ qua file này'));
  await settle();
  await settle();
  expect(alertSpy).toHaveBeenCalledWith('Không có file PDF hoặc ảnh hợp lệ');
  expect(mockDismissTo).toHaveBeenCalledWith('/');
  expect(add).not.toHaveBeenCalled();
});

test('Merge with other files hands the file and its password to the pending store', async () => {
  await renderIncoming();
  await enter('secret');
  await fireEvent.press(screen.getByRole('button', { name: 'Gộp với file khác' }));
  expect(mockReplace).toHaveBeenCalledWith('/merge');
  expect(takePdfs()).toEqual([{ ...pdf, password: 'secret' }]);
});

test('Skip with rejected files shows only the rejection popup, not the nothing-usable notice', async () => {
  (importIncoming as jest.Mock).mockResolvedValue({
    files: [pdf],
    skipped: [new UnsupportedFileError({ fileName: 'a.docx' })],
  });
  await renderIncoming();
  await fireEvent.press(screen.getByText('Bỏ qua file này'));
  await settle();
  await settle();
  expect(alertSpy).toHaveBeenCalledTimes(1);
  expect(alertSpy).not.toHaveBeenCalledWith('Không có file PDF hoặc ảnh hợp lệ');
  expect(mockDismissTo).toHaveBeenCalledWith('/');
});

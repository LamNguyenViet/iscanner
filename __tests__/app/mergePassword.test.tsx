import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Merge from '../../app/merge';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';
import { deleteFiles } from '../../src/native/deleteFiles';
import { readBytes } from '../../src/native/readBytes';
import { pickPdfs } from '../../src/native/pickPdfs';
import { PDFDocument } from '../../src/pdf/pdfLib';
import { clearPending, setPending } from '../../src/share/incomingStore';
import { makePasswordPdf } from '../fixtures/pdfPassword';

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
jest.mock('../../src/native/pickPdfs', () => ({ pickPdfs: jest.fn() }));
jest.mock('../../src/native/readBytes', () => ({ readBytes: jest.fn() }));
jest.mock('../../src/native/deleteFiles', () => ({
  deleteFiles: jest.fn().mockResolvedValue(undefined),
}));
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

const mockPick = pickPdfs as jest.Mock;
const mockRead = readBytes as jest.Mock;

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

let files: Record<string, Uint8Array>;
let alertSpy: jest.SpyInstance;

async function plainPdf(): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  d.addPage([100, 100]);
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

beforeAll(async () => {
  files = {
    'file:///p.pdf': makePasswordPdf(),
    'file:///q.pdf': makePasswordPdf({ userPassword: 'other' }),
    'file:///plain.pdf': await plainPdf(),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  clearPending();
  mockRead.mockImplementation(async (uri: string) => files[uri]);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

test('asks for the password, adds the row, and merges into a plain PDF', async () => {
  mockPick.mockResolvedValueOnce([
    { uri: 'file:///p.pdf', name: 'p.pdf' },
    { uri: 'file:///plain.pdf', name: 'plain.pdf' },
  ]);
  const { add } = await renderMerge();
  expect(screen.getByText('"p.pdf" được bảo vệ bằng mật khẩu.')).toBeTruthy();
  await fireEvent.changeText(screen.getByPlaceholderText('Mật khẩu'), 'secret');
  await fireEvent.press(screen.getByText('Mở'));
  await settle();
  await settle();
  expect(screen.getByText('p.pdf')).toBeTruthy();
  expect(screen.getByText('plain.pdf')).toBeTruthy();
  expect(screen.getAllByText('1 trang')).toHaveLength(2);
  await fireEvent.press(screen.getByText('Gộp PDF'));
  await settle();
  expect(add).toHaveBeenCalledTimes(1);
  const stored = add.mock.calls[0][0] as Uint8Array;
  expect(Buffer.from(stored).toString('latin1')).not.toContain('/Encrypt');
  expect((await PDFDocument.load(stored)).getPageCount()).toBe(2);
});

test('a skipped file shows no PDF_ENCRYPTED popup and the others stay', async () => {
  mockPick.mockResolvedValueOnce([
    { uri: 'file:///q.pdf', name: 'q.pdf' },
    { uri: 'file:///plain.pdf', name: 'plain.pdf' },
  ]);
  await renderMerge();
  await fireEvent.press(screen.getByText('Bỏ qua file này'));
  await settle();
  await settle();
  expect(alertSpy).not.toHaveBeenCalled();
  expect(screen.queryByText('q.pdf')).toBeNull();
  expect(screen.getByText('plain.pdf')).toBeTruthy();
});

test('a wrong password re-asks with the wrong line', async () => {
  mockPick.mockResolvedValueOnce([{ uri: 'file:///p.pdf', name: 'p.pdf' }]);
  await renderMerge();
  await fireEvent.changeText(screen.getByPlaceholderText('Mật khẩu'), 'nope');
  await fireEvent.press(screen.getByText('Mở'));
  await settle();
  await settle();
  expect(screen.getByText('Mật khẩu không đúng, vui lòng thử lại.')).toBeTruthy();
});

test('unmounting with the prompt open throws nothing and does not navigate back', async () => {
  mockPick.mockResolvedValueOnce([{ uri: 'file:///p.pdf', name: 'p.pdf' }]);
  const { view } = await renderMerge();
  expect(screen.getByText('Nhập mật khẩu')).toBeTruthy();
  await view.unmount();
  await settle();
  await settle();
  expect(alertSpy).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  expect(deleteFiles).toHaveBeenCalledWith(expect.arrayContaining(['file:///p.pdf']));
});

test('unmounting during the first prompt does not hang on a second encrypted file and deletes every copy', async () => {
  files['file:///p2.pdf'] = makePasswordPdf();
  mockPick.mockResolvedValueOnce([
    { uri: 'file:///p.pdf', name: 'p.pdf' },
    { uri: 'file:///p2.pdf', name: 'p2.pdf' },
    { uri: 'file:///plain.pdf', name: 'plain.pdf' },
  ]);
  const { view } = await renderMerge();
  await view.unmount();
  await settle();
  await settle();
  const deleted = (deleteFiles as jest.Mock).mock.calls.flatMap((c) => c[0] as string[]);
  expect(deleted).toEqual(
    expect.arrayContaining(['file:///p.pdf', 'file:///p2.pdf', 'file:///plain.pdf']),
  );
  expect(alertSpy).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
});

test('pending files carry their password so the merge screen does not re-ask', async () => {
  setPending({
    pdfs: [
      { uri: 'file:///p.pdf', name: 'p.pdf', kind: 'pdf', size: 1, password: 'secret' },
      { uri: 'file:///plain.pdf', name: 'plain.pdf', kind: 'pdf', size: 1 },
    ],
    images: [],
  });
  const { add } = await renderMerge();
  expect(screen.queryByText('Nhập mật khẩu')).toBeNull();
  expect(screen.getByText('p.pdf')).toBeTruthy();
  await fireEvent.press(screen.getByText('Gộp PDF'));
  await settle();
  const stored = add.mock.calls[0][0] as Uint8Array;
  expect(Buffer.from(stored).toString('latin1')).not.toContain('/Encrypt');
});

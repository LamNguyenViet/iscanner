import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Home from '../../app/index';
import { LocaleProvider } from '../../src/i18n/LocaleContext';
import { LibraryProvider } from '../../src/library/LibraryContext';
import { createLibraryStore } from '../../src/library/libraryStore';
import { createMemoryFs } from '../../src/library/memoryFs';
import { readBytes } from '../../src/native/readBytes';
import { pickDocuments } from '../../src/native/pickPdfs';
import { convertWordToPdf } from '../../src/convert/convertWord';
import { WordConvertError } from '../../src/errors/AppError';

const mockPush = jest.fn();
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
let mockLocales = [{ languageCode: 'vi', languageTag: 'vi-VN' }];
jest.mock('expo-localization', () => ({ useLocales: () => mockLocales }));
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Stack: {
    Screen: ({ options }: { options?: any }) => {
      const { createElement, Fragment } = require('react');
      return createElement(Fragment, null, options?.headerLeft?.({}), options?.headerRight?.({}));
    },
  },
  useFocusEffect: (cb: () => void) => {
    require('react').useEffect(() => cb(), []);
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
jest.mock('../../src/native/deleteFiles', () => ({ deleteFiles: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/native/printPdf', () => ({ printHtmlToPdf: jest.fn() }));
jest.mock('../../src/native/officeCryptoNative', () => ({ nativeIteratedHash: jest.fn() }));
jest.mock('../../src/convert/convertWord', () => ({ convertWordToPdf: jest.fn() }));

const mockPick = pickDocuments as jest.Mock;
const mockRead = readBytes as jest.Mock;
const mockConvert = convertWordToPdf as jest.Mock;

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

let alertSpy: jest.SpyInstance;

async function renderHome(english = false) {
  mockLocales = [{ languageCode: english ? 'en' : 'vi', languageTag: english ? 'en-US' : 'vi-VN' }];
  let n = 0;
  const store = createLibraryStore({ fs: createMemoryFs(), newId: () => `d${++n}` });
  await render(
    <LocaleProvider fs={createMemoryFs()}>
      <LibraryProvider store={store}>
        <Home />
      </LibraryProvider>
    </LocaleProvider>,
  );
  await settle();
  return store;
}

beforeEach(() => {
  mockPush.mockClear();
  mockPick.mockReset();
  mockConvert.mockReset();
  mockRead.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('bottom bar has three buttons in Vietnamese', async () => {
  await renderHome();
  expect(screen.getByText('Scan')).toBeTruthy();
  expect(screen.getByText('Gộp PDF')).toBeTruthy();
  expect(screen.getByText('Word → PDF')).toBeTruthy();
});

test('bottom bar has three buttons in English', async () => {
  await renderHome(true);
  expect(screen.getByText('Scan')).toBeTruthy();
  expect(screen.getByText('Merge PDF')).toBeTruthy();
  expect(screen.getByText('Word → PDF')).toBeTruthy();
});

test('picks Word files and opens the viewer for a single result', async () => {
  mockPick.mockResolvedValue([{ uri: 'u1', name: 'hop-dong.docx' }]);
  mockConvert.mockResolvedValue({ uri: 'file:///c/1.pdf', pageCount: 2 });
  await renderHome();
  await fireEvent.press(screen.getByText('Word → PDF'));
  await settle();
  expect(mockPick).toHaveBeenCalledWith([
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);
  expect(mockPush).toHaveBeenCalledWith('/viewer/d1');
});

test('two files stay on the library and both are listed', async () => {
  mockPick.mockResolvedValue([
    { uri: 'u1', name: 'hop-dong.docx' },
    { uri: 'u2', name: 'bao-cao.docx' },
  ]);
  mockConvert.mockResolvedValue({ uri: 'file:///c/1.pdf', pageCount: 1 });
  await renderHome();
  await fireEvent.press(screen.getByText('Word → PDF'));
  await settle();
  expect(mockPush).not.toHaveBeenCalled();
  expect(await screen.findByText('hop-dong')).toBeTruthy();
  expect(screen.getByText('bao-cao')).toBeTruthy();
});

test('a failure shows one alert with the file name', async () => {
  mockPick.mockResolvedValue([{ uri: 'u1', name: 'bad.docx' }]);
  mockConvert.mockRejectedValue(new WordConvertError({ fileName: 'bad.docx' }));
  await renderHome();
  await fireEvent.press(screen.getByText('Word → PDF'));
  await settle();
  expect(alertSpy).toHaveBeenCalledTimes(1);
  expect(alertSpy.mock.calls[0][1]).toContain('bad.docx');
  expect(mockPush).not.toHaveBeenCalled();
});

test('cancelling the picker does nothing', async () => {
  mockPick.mockResolvedValue([]);
  await renderHome();
  await fireEvent.press(screen.getByText('Word → PDF'));
  await settle();
  expect(mockConvert).not.toHaveBeenCalled();
  expect(alertSpy).not.toHaveBeenCalled();
});

test('while converting, Scan and Merge are disabled and a spinner shows', async () => {
  let release!: (v: unknown) => void;
  mockPick.mockResolvedValue([{ uri: 'u1', name: 'a.docx' }]);
  mockConvert.mockReturnValue(new Promise((r) => (release = r)));
  await renderHome();
  expect(screen.queryByLabelText('Đang chuyển file Word…')).toBeNull();
  void fireEvent.press(screen.getByText('Word → PDF'));
  await settle();
  expect(screen.getByLabelText('Đang chuyển file Word…')).toBeTruthy();
  await fireEvent.press(screen.getByText('Scan'));
  await fireEvent.press(screen.getByText('Gộp PDF'));
  expect(mockPush).not.toHaveBeenCalled();
  await act(async () => {
    release({ uri: 'file:///c/1.pdf', pageCount: 1 });
  });
  await settle();
  expect(screen.queryByLabelText('Đang chuyển file Word…')).toBeNull();
});

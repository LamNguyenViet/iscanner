import { Alert, Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { PdfEncryptedError, PdfLoadError } from '../../src/errors/AppError';
import { useErrorAlert } from '../../src/errors/useErrorAlert';
import { LocaleProvider } from '../../src/i18n/LocaleContext';
import { createMemoryFs } from '../../src/library/memoryFs';
import { log } from '../../src/logging/logger';

let mockLocales: { languageCode: string | null; languageTag: string }[] = [];
jest.mock('expo-localization', () => ({ useLocales: () => mockLocales }));

let show: ReturnType<typeof useErrorAlert> = () => {};
function Probe() {
  show = useErrorAlert();
  return <Text>probe</Text>;
}
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
let spy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockLocales = [{ languageCode: 'en', languageTag: 'en-US' }];
  spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => spy.mockRestore());

test('logs one error per error shown', async () => {
  await render(<Probe />);
  const e = new PdfLoadError({ fileName: 'x.pdf' });
  show(e);
  expect(log.error).toHaveBeenCalledTimes(1);
  expect(log.error).toHaveBeenCalledWith('PDF_LOAD', e.message, expect.objectContaining({ file: 'x.pdf' }));
  (log.error as jest.Mock).mockClear();
  show([new PdfLoadError({ fileName: 'a.pdf' }), new PdfEncryptedError({ fileName: 'b.pdf' })]);
  expect(log.error).toHaveBeenCalledTimes(2);
});

test('vi without a provider', async () => {
  await render(<Probe />);
  show(new PdfLoadError());
  expect(spy).toHaveBeenCalledWith(
    'Không load được file',
    'Không load được file, vui lòng kiểm tra lại định dạng file PDF.\n\nMã lỗi: PDF_LOAD',
    undefined,
  );
});

test('en with provider on an en device', async () => {
  await render(<LocaleProvider fs={createMemoryFs()}><Probe /></LocaleProvider>);
  await settle();
  show(new PdfLoadError());
  expect(spy).toHaveBeenCalledWith(
    'Cannot load file',
    "Cannot load file, check your document's format file PDF.\n\nError code: PDF_LOAD",
    undefined,
  );
});

test('plain Error gives UNKNOWN', async () => {
  await render(<Probe />);
  show(new Error('x'));
  expect(spy).toHaveBeenCalledWith('Có lỗi xảy ra', 'Đã có lỗi không mong muốn, vui lòng thử lại.\n\nMã lỗi: UNKNOWN', undefined);
});

test('array gives the joined list', async () => {
  await render(<Probe />);
  show([new PdfEncryptedError({ fileName: 'a.pdf' }), new PdfLoadError({ fileName: 'b.pdf' })]);
  expect(spy).toHaveBeenCalledWith(
    'File PDF có mật khẩu',
    'a.pdf — có mật khẩu\nb.pdf — sai định dạng\n\nMã lỗi: PDF_ENCRYPTED',
    undefined,
  );
});

test('buttons are passed through', async () => {
  await render(<Probe />);
  const buttons = [{ text: 'OK' }];
  show(new PdfLoadError(), { buttons });
  expect(spy.mock.calls[0][2]).toBe(buttons);
});

test('empty array is a no-op', async () => {
  await render(<Probe />);
  show([]);
  expect(spy).not.toHaveBeenCalled();
});

test('a single failed file shows its name and the full message', async () => {
  await render(<Probe />);
  show(new PdfLoadError({ fileName: 'x.pdf' }));
  expect(spy).toHaveBeenCalledWith(
    'Không load được file',
    'x.pdf\nKhông load được file, vui lòng kiểm tra lại định dạng file PDF.\n\nMã lỗi: PDF_LOAD',
    undefined,
  );
});

import {
  AppError, CameraPermissionError, FileReadError, FileTooLargeError, ImageProcessError, PdfEncryptedError,
  PdfLoadError, ScannerUnavailableError, ShareError, StorageError, UpdateCorruptError, UpdateDownloadError, UpdateInstallError, UnknownError, UnsupportedFileError, toAppError,
} from '../../src/errors/AppError';
import { EncryptedPDFError } from '../../src/pdf/pdfLib';

const cause = new Error('root');
const simple: [string, new (o?: { fileName?: string; cause?: unknown }) => AppError, string][] = [
  ['FileTooLargeError', FileTooLargeError, 'FILE_TOO_LARGE'],
  ['UnsupportedFileError', UnsupportedFileError, 'FILE_UNSUPPORTED'],
  ['FileReadError', FileReadError, 'FILE_READ'],
  ['CameraPermissionError', CameraPermissionError, 'CAMERA_PERMISSION'],
  ['ScannerUnavailableError', ScannerUnavailableError, 'SCANNER_UNAVAILABLE'],
  ['ImageProcessError', ImageProcessError, 'IMAGE_PROCESS'],
  ['StorageError', StorageError, 'STORAGE'],
  ['ShareError', ShareError, 'SHARE'],
  ['UnknownError', UnknownError, 'UNKNOWN'],
  ['UpdateDownloadError', UpdateDownloadError, 'UPDATE_DOWNLOAD'],
  ['UpdateCorruptError', UpdateCorruptError, 'UPDATE_CORRUPT'],
  ['UpdateInstallError', UpdateInstallError, 'UPDATE_INSTALL'],
];

test.each(simple)('%s', (name, Cls, code) => {
  const e = new Cls({ fileName: 'f.pdf', cause });
  expect(e.code).toBe(code);
  expect(e.name).toBe(name);
  expect(e).toBeInstanceOf(AppError);
  expect(e).toBeInstanceOf(Cls);
  expect(e).toBeInstanceOf(Error);
  expect(e.fileName).toBe('f.pdf');
  expect(e.cause).toBe(cause);
  expect(new Cls().fileName).toBeUndefined();
});

test.each([['PdfLoadError', PdfLoadError, 'PDF_LOAD'], ['PdfEncryptedError', PdfEncryptedError, 'PDF_ENCRYPTED']] as const)(
  '%s', (name, Cls, code) => {
    const e = new Cls({ index: 2, fileName: 'a.pdf', cause });
    expect(e.code).toBe(code);
    expect(e.name).toBe(name);
    expect(e).toBeInstanceOf(AppError);
    expect(e).toBeInstanceOf(Cls);
    expect(e.index).toBe(2);
    expect(e.fileName).toBe('a.pdf');
    expect(e.cause).toBe(cause);
    expect(new Cls().index).toBeUndefined();
  });

test('AppError message option', () => {
  expect(new AppError('STORAGE', { message: 'disk' }).message).toBe('disk');
});

describe('toAppError', () => {
  test('AppError is returned as is', () => {
    const e = new ShareError();
    expect(toAppError(e)).toBe(e);
  });
  test('name EncryptedPDFError becomes PdfEncryptedError', () => {
    const raw = Object.assign(new Error('x'), { name: 'EncryptedPDFError' });
    const e = toAppError(raw);
    expect(e).toBeInstanceOf(PdfEncryptedError);
    expect(e.cause).toBe(raw);
  });
  test('real EncryptedPDFError', () => {
    expect(toAppError(new EncryptedPDFError())).toBeInstanceOf(PdfEncryptedError);
  });
  test('an unrelated error mentioning encryption stays UnknownError', () => {
    expect(toAppError(new Error('storage is encrypted'))).toBeInstanceOf(UnknownError);
  });
  test('others become UnknownError with cause', () => {
    const boom = new Error('boom');
    const a = toAppError(boom);
    expect(a).toBeInstanceOf(UnknownError);
    expect(a.cause).toBe(boom);
    const b = toAppError('str');
    expect(b).toBeInstanceOf(UnknownError);
    expect(b.cause).toBe('str');
  });
});

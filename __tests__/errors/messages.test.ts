import { PdfEncryptedError, PdfLoadError, UnknownError, type AppError, type ErrorCode } from '../../src/errors/AppError';
import * as E from '../../src/errors/AppError';
import { errorContent, errorsContent } from '../../src/errors/messages';
import { en } from '../../src/i18n/en';
import { vi } from '../../src/i18n/vi';

const make: Record<ErrorCode, () => AppError> = {
  PDF_LOAD: () => new E.PdfLoadError(), PDF_ENCRYPTED: () => new E.PdfEncryptedError(),
  FILE_TOO_LARGE: () => new E.FileTooLargeError(), FILE_UNSUPPORTED: () => new E.UnsupportedFileError(),
  FILE_READ: () => new E.FileReadError(), CAMERA_PERMISSION: () => new E.CameraPermissionError(),
  SCANNER_UNAVAILABLE: () => new E.ScannerUnavailableError(), IMAGE_PROCESS: () => new E.ImageProcessError(),
  STORAGE: () => new E.StorageError(), SHARE: () => new E.ShareError(), UNKNOWN: () => new E.UnknownError(),
};

const viCopy: Record<ErrorCode, [string, string]> = {
  PDF_LOAD: ['Không load được file', 'Không load được file, vui lòng kiểm tra lại định dạng file PDF.'],
  PDF_ENCRYPTED: ['File PDF có mật khẩu', 'Không mở được file PDF được bảo vệ bằng mật khẩu. Hãy gỡ mật khẩu rồi thử lại.'],
  FILE_TOO_LARGE: ['File quá lớn', 'File vượt quá 100 MB, iScanner không xử lý được.'],
  FILE_UNSUPPORTED: ['File không được hỗ trợ', 'iScanner chỉ nhận file PDF và ảnh JPEG/PNG.'],
  FILE_READ: ['Không đọc được file', 'Không đọc được file. Hãy mở lại file từ ứng dụng gốc rồi chia sẻ lại.'],
  CAMERA_PERMISSION: ['Cần quyền camera', 'Hãy cấp quyền camera cho iScanner trong Cài đặt.'],
  SCANNER_UNAVAILABLE: ['Không thể scan tài liệu', 'Máy chưa hỗ trợ trình quét tài liệu (cần Google Play services). Bạn vẫn có thể gộp PDF và nhận file chia sẻ.'],
  IMAGE_PROCESS: ['Không xử lý được ảnh', 'Không xử lý được ảnh này, vui lòng chụp lại.'],
  STORAGE: ['Không lưu được tài liệu', 'Không lưu được tài liệu. Hãy kiểm tra dung lượng trống của máy.'],
  SHARE: ['Không chia sẻ được', 'Không mở được bảng chia sẻ, vui lòng thử lại.'],
  UNKNOWN: ['Có lỗi xảy ra', 'Đã có lỗi không mong muốn, vui lòng thử lại.'],
};
const enCopy: Record<ErrorCode, [string, string]> = {
  PDF_LOAD: ['Cannot load file', "Cannot load file, check your document's format file PDF."],
  PDF_ENCRYPTED: ['Password-protected PDF', 'This PDF is protected by a password. Remove the password and try again.'],
  FILE_TOO_LARGE: ['File too large', "The file is larger than 100 MB and can't be processed."],
  FILE_UNSUPPORTED: ['Unsupported file', 'iScanner only accepts PDF files and JPEG/PNG images.'],
  FILE_READ: ['Cannot read file', "The file couldn't be read. Open it again in the original app and share it again."],
  CAMERA_PERMISSION: ['Camera permission needed', 'Allow iScanner to use the camera in Settings.'],
  SCANNER_UNAVAILABLE: ["Can't scan documents", "This device doesn't support the document scanner (Google Play services required). You can still merge PDFs and receive shared files."],
  IMAGE_PROCESS: ['Cannot process image', "This image couldn't be processed. Please retake it."],
  STORAGE: ['Cannot save document', "The document couldn't be saved. Check your device's free storage."],
  SHARE: ['Cannot share', "The share sheet couldn't be opened. Please try again."],
  UNKNOWN: ['Something went wrong', 'An unexpected error occurred. Please try again.'],
};

const codes = Object.keys(make) as ErrorCode[];

test.each(codes)('%s copy in vi and en', (code) => {
  expect(errorContent(make[code](), vi)).toEqual({ title: viCopy[code][0], message: viCopy[code][1], code });
  expect(errorContent(make[code](), en)).toEqual({ title: enCopy[code][0], message: enCopy[code][1], code });
});

test('PDF_LOAD sentences', () => {
  expect(errorContent(new PdfLoadError(), vi).message).toBe('Không load được file, vui lòng kiểm tra lại định dạng file PDF.');
  expect(errorContent(new PdfLoadError(), en).message).toBe("Cannot load file, check your document's format file PDF.");
});


test('errorsContent joins one line per file', () => {
  const r = errorsContent([new PdfEncryptedError({ fileName: 'a.pdf' }), new PdfLoadError({ fileName: 'b.pdf' })], vi);
  expect(r).toEqual({ title: 'File PDF có mật khẩu', message: 'a.pdf — có mật khẩu\nb.pdf — sai định dạng', code: 'PDF_ENCRYPTED' });
});

test('reasons per code and fallback to title', () => {
  const r = errorsContent([new E.FileTooLargeError({ fileName: 'a' }), new E.UnsupportedFileError({ fileName: 'b' }),
    new E.FileReadError({ fileName: 'c' }), new E.ShareError({ fileName: 'd' })], en);
  expect(r.message).toBe('a — too large (> 100 MB)\nb — unsupported\nc — unreadable\nd — Cannot share');
});

test('nameless file uses untitled', () => {
  expect(errorsContent([new PdfLoadError(), new UnknownError()], vi).message).toBe('Tài liệu — sai định dạng\nTài liệu — Có lỗi xảy ra');
  expect(errorsContent([new PdfLoadError(), new PdfLoadError()], en).message).toBe('Document — invalid format\nDocument — invalid format');
});

test('single error without a file name equals errorContent', () => {
  const e = new PdfLoadError();
  expect(errorsContent([e], vi)).toEqual(errorContent(e, vi));
});

test('single error with a file name is the file name then the full message', () => {
  const e = new PdfLoadError({ fileName: 'x.pdf' });
  expect(errorsContent([e], vi)).toEqual({
    title: 'Không load được file',
    message: 'x.pdf\nKhông load được file, vui lòng kiểm tra lại định dạng file PDF.',
    code: 'PDF_LOAD',
  });
  expect(errorsContent([e], en).message).toBe("x.pdf\nCannot load file, check your document's format file PDF.");
});

test('code line', () => {
  expect(vi.errors.codeLine('PDF_LOAD')).toBe('Mã lỗi: PDF_LOAD');
  expect(en.errors.codeLine('PDF_LOAD')).toBe('Error code: PDF_LOAD');
});

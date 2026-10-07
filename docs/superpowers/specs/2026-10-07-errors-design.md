# iScanner — Typed Errors and Localized Error Popups — Design Spec

- **Date:** 2026-10-07
- **Source:** requirement "07/10/2026 - sequence 2", part 3 of 5:

  > Thông tin lỗi popup cho người dùng biết ví du: PdfLoadError class, thêm message popup hiển thị cho người dùng "Không load được file, vui lòng kiểm tra lại định dạng file PDF." english "Cannot load file, check your document's format file PDF."

- **Builds on:** part 2, i18n (`useLocale()`, `vi`/`en` tables, `Strings = typeof vi`).
- **Feeds:** part 4, logging (every shown error passes through one function that will also log it, with its code and cause).
- **Status:** Approved in chat; awaiting written-spec review.

## 1. Goal and decisions

Every error a user can hit is a named class with a stable code. It is shown through one function as a localized popup that says what happened and what to do, with the error code on the last line.

| Topic | Decision |
|---|---|
| Error model | A base `AppError extends Error` with `code`, an optional `fileName` and an optional `cause`. One subclass per case (§2). `toAppError(unknown)` normalizes anything thrown. |
| Copy | A pure `errorContent(err, t)` returns `{ title, message, code }`. The text lives in `t.errors.<CODE>` in both tables. |
| Display | `useErrorAlert()` returns `showError(err \| err[], opts?)`, which calls `Alert.alert(title, message + "\n\n" + t.errors.codeLine(code), buttons)`. `opts.buttons` replaces the default single OK/Close button (used for `Mở Cài đặt`). |
| Error code in popup | Yes. The last line reads `Mã lỗi: PDF_LOAD` / `Error code: PDF_LOAD`. |
| Several failed files | One popup. The title is that of the first error. The message lists `<file name> — <short reason>` per file. The code shown is the first error's code. |
| Not errors | Confirmations (`Xoá tài liệu này?`) and the incoming "nothing usable" notice stay as they are. When every incoming file was rejected with a typed error, the per-file error popup replaces the "nothing usable" notice. |
| Version | 1.5.0, versionCode 5, iOS buildNumber "5". |

Out of scope: logging (part 4), crash reporting, and retry flows.

## 2. Error catalogue

| Class | Code | vi title / message | en title / message | Raised by |
|---|---|---|---|---|
| `PdfLoadError` | `PDF_LOAD` | Không load được file / **Không load được file, vui lòng kiểm tra lại định dạng file PDF.** | Cannot load file / **Cannot load file, check your document's format file PDF.** | `mergePdfs` load (parse failure) |
| `PdfEncryptedError` | `PDF_ENCRYPTED` | File PDF có mật khẩu / Không mở được file PDF được bảo vệ bằng mật khẩu. Hãy gỡ mật khẩu rồi thử lại. | Password-protected PDF / This PDF is protected by a password. Remove the password and try again. | `mergePdfs` load (the pdf library's `EncryptedPDFError`) |
| `FileTooLargeError` | `FILE_TOO_LARGE` | File quá lớn / File vượt quá 100 MB, iScanner không xử lý được. | File too large / The file is larger than 100 MB and can't be processed. | `importIncoming` |
| `UnsupportedFileError` | `FILE_UNSUPPORTED` | File không được hỗ trợ / iScanner chỉ nhận file PDF và ảnh JPEG/PNG. | Unsupported file / iScanner only accepts PDF files and JPEG/PNG images. | `importIncoming` |
| `FileReadError` | `FILE_READ` | Không đọc được file / Không đọc được file. Hãy mở lại file từ ứng dụng gốc rồi chia sẻ lại. | Cannot read file / The file couldn't be read. Open it again in the original app and share it again. | `importIncoming`, `readBytes` failures in incoming/merge |
| `CameraPermissionError` | `CAMERA_PERMISSION` | Cần quyền camera / Hãy cấp quyền camera cho iScanner trong Cài đặt. | Camera permission needed / Allow iScanner to use the camera in Settings. | `scanner` (message matches `/permission/i`) |
| `ScannerUnavailableError` | `SCANNER_UNAVAILABLE` | Không thể scan tài liệu / Máy chưa hỗ trợ trình quét tài liệu (cần Google Play services). Bạn vẫn có thể gộp PDF và nhận file chia sẻ. | Can't scan documents / This device doesn't support the document scanner (Google Play services required). You can still merge PDFs and receive shared files. | `scanner` (message matches `/google play\|not available\|unavailable\|not supported/i`) |
| `ImageProcessError` | `IMAGE_PROCESS` | Không xử lý được ảnh / Không xử lý được ảnh này, vui lòng chụp lại. | Cannot process image / This image couldn't be processed. Please retake it. | `PageEditor` (crop/rotate/detect failures), image embedding in PDF creation (`UNSUPPORTED_IMAGE`) |
| `StorageError` | `STORAGE` | Không lưu được tài liệu / Không lưu được tài liệu. Hãy kiểm tra dung lượng trống của máy. | Cannot save document / The document couldn't be saved. Check your device's free storage. | `libraryStore` `add`/`rename`/`remove` write failures |
| `ShareError` | `SHARE` | Không chia sẻ được / Không mở được bảng chia sẻ, vui lòng thử lại. | Cannot share / The share sheet couldn't be opened. Please try again. | `shareDocument` |
| `UnknownError` | `UNKNOWN` | Có lỗi xảy ra / Đã có lỗi không mong muốn, vui lòng thử lại. | Something went wrong / An unexpected error occurred. Please try again. | `toAppError` fallback |

- **Short per-file reasons** (`t.errors.reason.<CODE>`), used in multi-file lists:
  - vi: `sai định dạng` / `có mật khẩu` / `quá lớn (> 100 MB)` / `không hỗ trợ` / `không đọc được`
  - en: `invalid format` / `password-protected` / `too large (> 100 MB)` / `unsupported` / `unreadable`
  - Other codes fall back to the title.
- **Code line:** vi `Mã lỗi: ${code}`, en `Error code: ${code}`.
- **Camera permission popup:** keeps its `Mở Cài đặt` / `Huỷ` buttons. When a scanner error is not recognized (its text may be localized by the OS), the scan screen shows the `UNKNOWN` content but keeps an `Mở Cài đặt` / `Đóng` button pair, preserving today's hint behaviour, since the underlying cause may be a denied permission.

## 3. Modules

### 3.1 `src/errors/AppError.ts` (pure)

```ts
export type ErrorCode = 'PDF_LOAD' | 'PDF_ENCRYPTED' | 'FILE_TOO_LARGE' | 'FILE_UNSUPPORTED' | 'FILE_READ'
  | 'CAMERA_PERMISSION' | 'SCANNER_UNAVAILABLE' | 'IMAGE_PROCESS' | 'STORAGE' | 'SHARE' | 'UNKNOWN';
export class AppError extends Error { readonly code: ErrorCode; readonly fileName?: string; constructor(code, opts?: { fileName?: string; cause?: unknown }) }
export class PdfLoadError extends AppError { readonly index?: number }   // + PdfEncryptedError (also index), FileTooLargeError, …, UnknownError
export function toAppError(e: unknown): AppError;
```

- `name` equals the class name.
- `Object.setPrototypeOf` is used so `instanceof` works under Hermes and Babel.
- `toAppError` rules:
  - an `AppError` is returned unchanged;
  - the pdf library's `EncryptedPDFError` becomes `PdfEncryptedError`;
  - anything else becomes `UnknownError` with `cause` set.
- The scanner mapping happens in `scanner.ts`, which knows its context.

### 3.2 `src/errors/messages.ts` (pure)

- `errorContent(err: AppError, t: Strings): { title: string; message: string; code: ErrorCode }`
- `errorsContent(errs: AppError[], t: Strings)`:
  - one error gives `errorContent`;
  - several give `{ title: first title, message: lines "<fileName || t.common.untitled> — <reason>", code: first code }`.

### 3.3 `src/errors/useErrorAlert.ts`

- `useErrorAlert(): (err: unknown | unknown[], opts?: { buttons?: AlertButton[] }) => void`.
- Each input goes through `toAppError`, then `errorsContent`, then `Alert.alert(title, message + '\n\n' + t.errors.codeLine(code), opts?.buttons)`.
- This is the single place part 4 hooks for logging.

### 3.4 Changed producers

- **`src/pdf/mergePdfs.ts`:** `PdfLoadError` moves to `src/errors`. `mergePdfs` re-exports it for compatibility, or imports are updated.
  - `loadPdf(bytes, index, fileName?)` throws `PdfEncryptedError` for the encrypted case and `PdfLoadError` otherwise, with `index` and `fileName`.
- **`src/workflows/mergeWorkflow.ts`:** `loadPickedPdfs` returns `{ loaded, failed: AppError[] }`, with a read failure becoming `FileReadError`.
- **`src/share/importIncoming.ts`:** `skipped: AppError[]` (`FileTooLargeError`, `UnsupportedFileError`, `FileReadError`), each carrying `fileName`.
- **`src/scanner/scanner.ts`:** throws `CameraPermissionError` / `ScannerUnavailableError`, and otherwise rethrows `toAppError(e)`.
- **`src/library/libraryStore.ts`:** write failures in `add`/`rename`/`remove` are wrapped as `StorageError`. `NOT_FOUND` stays an internal `Error`.
- **`src/native/share.ts`:** failures are wrapped as `ShareError`.
- **`src/pdf/images.ts`:** `UNSUPPORTED_IMAGE` becomes `ImageProcessError`. **`src/components/PageEditor.tsx`:** failures become `ImageProcessError`, shown via `showError`.

### 3.5 Screens

- `index`, `viewer`, `scan`, `merge`, `incoming` and `PageEditor` replace every error `Alert.alert` with `showError(...)`.
- The keys that become unused are removed from both tables: `errors.generic`, `merge.readFailedTitle`/`pickFailed`/`createFailed`, `scan.createFailed`/`scanFailedTitle`/`scanFailedBody`, `incoming.readFailed`/`skipped`, `editor.failed`. The `incoming.skipped` count alert is replaced by the per-file error popup.
- The guard test from part 2 keeps all copy in `src/i18n/`.

## 4. Edge cases

| Situation | Behaviour |
|---|---|
| Error thrown that is not an `AppError` (bug, native exception) | `UNKNOWN` popup. `cause` is kept for part 4. |
| Merge: 1 of 3 PDFs is encrypted | The good files load. One popup titled "File PDF có mật khẩu" lists `x.pdf — có mật khẩu`, with code `PDF_ENCRYPTED`. |
| Incoming: all files rejected | The per-file popup replaces "Không có file PDF hoặc ảnh hợp lệ", then the app goes home as today. |
| Incoming: some rejected, some usable | The per-file popup is shown (as the skipped alert was), then the flow continues. |
| Error without a file name in a list | The line uses `t.common.untitled`. |
| Language changes while a popup is open | The popup keeps its text, because native Alert text is fixed once shown. |

## 5. Testing

- **Unit:**
  - each class's `code`, `name`, `instanceof AppError` and `fileName`;
  - `toAppError` for an `AppError`, the pdf library's `EncryptedPDFError`, a plain `Error` and a string;
  - `errorContent` for all 11 codes in vi and en, with exact copy from §2 (including the exact `PdfLoadError` text required by the requirement);
  - `errorsContent` with 2 different errors and with a nameless file;
  - the code line.
- **Producers:**
  - `getPdfPageCount`/`mergePdfs` on an encrypted PDF throws `PdfEncryptedError`; on garbage it throws `PdfLoadError`;
  - `loadPickedPdfs` failed entries are typed;
  - `importIncoming` returns `FileTooLargeError` for an oversize file and `UnsupportedFileError` for garbage;
  - `scanner` maps a permission message, a "Google Play services" message and others;
  - `libraryStore.add` with `failNextWrite` rejects with `StorageError`;
  - `shareDocument` failure becomes `ShareError`.
- **Screens** (RNTL v14):
  - merge with one corrupt PDF shows an Alert with title `Không load được file`, the message containing the exact required sentence and the file name, and `Mã lỗi: PDF_LOAD`; the same in English;
  - scan with a permission error shows the `Mở Cài đặt` button;
  - scan with "Google Play services" shows the `SCANNER_UNAVAILABLE` popup;
  - incoming with all files rejected shows the per-file popup;
  - the existing tests are updated to the new copy.
- **Android emulator:**
  - merge a corrupt `.pdf` and a password-protected PDF;
  - share an unsupported file;
  - check both languages.

## 6. Success criteria

1. Every error popup goes through `showError`. Each of the 11 codes has vi/en copy, verified by tests. The `PdfLoadError` popup shows exactly the required sentences.
2. Popups end with the error code line.
3. Multi-file failures produce one clear popup that lists each file and its reason.
4. Producers throw typed errors, with no bare `catch {}` that hides a known cause from the user.
5. All tests and typecheck pass, and the flows are verified on the emulator.

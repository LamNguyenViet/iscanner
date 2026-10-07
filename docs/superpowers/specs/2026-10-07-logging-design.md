# iScanner — System Log Files (daily, 7-day retention, no base64) — Design Spec

- **Date:** 2026-10-07
- **Source:** requirement "07/10/2026 - sequence 2", part 4 of 5. The requirement (Vietnamese) reads: "Chuẩn hóa lại log lưu log lỗi hệ thống trong file riêng theo mã ngày, retention log trong vòng 7 ngày, không lưu log data dạng base64 của file và hình ảnh."
- **Builds on:**
  - part 3: `AppError` and codes; `useErrorAlert`/`showError` is the single display point;
  - part 2: settings screen, `useLocale`.
- **Status:** approved in chat; awaiting written-spec review.

## 1. Goal and decisions

System errors, warnings and key events are written to a private log file per local day. Files older than 7 days are deleted. File and image content (bytes, base64, data URIs) never reaches a log. Users can send their logs from Settings.

| Topic | Decision |
|---|---|
| What is logged | `error` (every `showError`, uncaught JS errors, unhandled promise rejections), `warn` (handled failures that used to be silent or `console.warn`), `info` (key events, §3), `debug` (development only; console, never a file). |
| Where | `Paths.document/logs/YYYY-MM-DD.log` (local date), app-private. |
| Format | JSON Lines, one record per line (§2.1). |
| Retention | On every app start, delete `logs/*.log` whose date is more than 6 days before today (keep today + 6). Names that are not `YYYY-MM-DD.log` are ignored. |
| No binary or base64 | Every value passes through `redact` before writing (§2.2). Only names, sizes, counts and URIs are logged, never file or image content. |
| Mechanism | In-house logger over the existing `FsAdapter` (`expoFs` in the app, the memory fs in tests); appends with `expo-file-system`'s `write(…, { append: true })`. No new dependency. |
| Export | Settings gets a new group `Hỗ trợ` / `Support` with the row `Gửi log lỗi` / `Send error logs`. It concatenates the kept logs into one `.txt` and opens the system share sheet. |
| Version | 1.6.0, versionCode 6, iOS buildNumber "6". |

Out of scope: remote upload or crash-reporting services, native (Java/ObjC) crash logs, log viewing inside the app.

## 2. Modules

### 2.1 `src/logging/format.ts` (pure)

```ts
export type Level = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogRecord = { t: string; lvl: Level; code?: string; event?: string; msg?: string; file?: string; data?: unknown; cause?: unknown; app?: string; os?: string };
export function localIsoTimestamp(d: Date): string;       // "2026-10-07T19:35:12.481+07:00"
export function logFileName(d: Date): string;             // "2026-10-07.log" (local date)
export function formatRecord(r: LogRecord): string;       // JSON.stringify(redact(r)) + "\n"; never throws
export function serializeError(e: unknown, depth?: number): unknown; // { name, message, code?, fileName?, stack (≤ 20 lines), cause (≤ 3 levels) }
```

`app`/`os` are attached only to `error`, `fatal` and `app.start` records.

### 2.2 `src/logging/redact.ts` (pure)

`redact(value: unknown): unknown` returns a JSON-safe copy:

- `Uint8Array`, any typed array, `ArrayBuffer` or Node `Buffer` → `"[binary N bytes]"`.
- A string matching `/^data:([\w/+.-]+)?(;[^,]*)?;base64,/i` → `"[data-uri <mime|unknown>, N chars]"`.
- A string of ≥ 200 characters made only of `[A-Za-z0-9+/=\r\n]` (and at most 2 `=` at the end) → `"[base64 N chars]"`.
- Any other string longer than 2,000 characters → its first 2,000 characters plus `…[+N chars]`.
- An `Error` → `serializeError`.
- Objects and arrays are walked recursively:
  - deeper than 5 levels → `"[depth]"`;
  - arrays longer than 50 → the first 50 plus `"[+N items]"`;
  - circular references → `"[circular]"`;
  - functions and symbols → dropped.

### 2.3 `src/logging/retention.ts` (pure)

`expiredLogFiles(names: string[], today: Date, keepDays = 7): string[]` returns the names matching `YYYY-MM-DD.log` whose date is earlier than `today − (keepDays − 1)` days (local).

### 2.4 `src/logging/logger.ts`

```ts
export type Logger = {
  debug(msg: string, data?: unknown): void;
  info(event: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(code: string, msg: string, extra?: { file?: string; cause?: unknown; data?: unknown }): void;
  fatal(msg: string, cause: unknown): void;
  flush(): Promise<void>;
  init(meta: { app: string; os: string }): Promise<void>; // runs retention, sets meta
};
export function createLogger(deps: { fs: FsAdapter & { list(dir: string): Promise<string[]>; append(path: string, text: string): Promise<void> }; now?: () => Date; console?: Pick<Console, 'log' | 'warn' | 'error'>; dev?: boolean }): Logger;
export const log: Logger; // app singleton over expoFs
```

- **Buffering:**
  - Records are buffered and written on a 2-second timer.
  - `error`/`fatal` flush immediately.
  - The buffer holds at most 500 records; when full, the oldest are dropped and the next write records `{"lvl":"warn","msg":"log buffer overflow","data":{"dropped":N}}`.
- **Daily size cap:** once the current day's file is ≥ 2 MB (tracked by bytes written today), `info`/`debug` records are dropped for that day; `warn`/`error`/`fatal` are still written.
- **Never throws:** every method swallows its own failures (an fs error is ignored).
- **Dev mirroring:** in dev, records are also mirrored to the console, with `debug` going to the console only.
- **`FsAdapter`:** extend it (or a logging-specific adapter) with `list(dir)` and `append(path, text)`; `expoFs` implements them with `Directory#list()` and `File#write(text, { append: true })` (creating the file and directory if missing); the memory fs implements them for tests.

### 2.5 Wiring

- **`app/_layout.tsx`** (once, at module or first mount):
  - `log.init({ app: <version from expo-constants>, os: \`${Platform.OS} ${Platform.Version}\` })`;
  - `log.info('app.start', { language, theme })`;
  - install `ErrorUtils.setGlobalHandler((e, isFatal) => { log.fatal(…); void log.flush(); previous(e, isFatal) })`;
  - install the unhandled-rejection tracking that RN 0.86 supports (Hermes `HermesInternal.enablePromiseRejectionTracker` when available) → `log.error('UNHANDLED_REJECTION', …)`;
  - on `AppState` → `background`/`inactive`, call `log.flush()`.
- **`src/errors/useErrorAlert.ts`:** before alerting, `log.error(err.code, err.message, { file: err.fileName, cause: err.cause ?? err })` for each error shown.
- **Warnings** (replacing silent catches or `console.warn`):
  - `scan.tsx` normalizePage fallback;
  - PageEditor detection fell back to the full image;
  - `deleteFiles` failures;
  - settings load/save failures (theme/language contexts);
  - library `refresh` failures;
  - the iOS Inbox cleanup failure;
  - `sharedPayloads` read failures.
- **Events (`info`):**
  - `scan.pdfCreated {pages, pageSize}`, `scan.cancelled`;
  - `merge.created {files, pages}`;
  - `share.received {pdf, image, rejected}`, `incoming.saved`;
  - `document.renamed`, `document.deleted`, `document.shared`;
  - `settings.theme {value}`, `settings.language {value}`;
  - `logs.exported {files, bytes}`.
- **`console.*` calls:** `[normalizePage]` and `[detectQuad]` become `log.debug` (dev console only). No other `console.*` remains in `app/` or `src/` outside the logger.

### 2.6 `src/logging/exportLogs.ts` and Settings

- `exportLogs(deps): Promise<{ uri: string; files: number; bytes: number } | null>`:
  1. flushes;
  2. lists the kept log files in date order;
  3. writes `Paths.cache/iScanner-logs-<YYYY-MM-DD>.txt` = a header (`iScanner <version> · <os> · <language>`, generated time) followed by each file's content under a `=== <file name> ===` line;
  4. returns `null` when there are no logs.
- `src/native/shareLogs.ts` calls `Sharing.shareAsync(uri, { mimeType: 'text/plain', UTI: 'public.plain-text' })` and wraps failures as `ShareError`.
- **Settings screen:**
  - new group `Hỗ trợ` / `Support` with the row `Gửi log lỗi` / `Send error logs`;
  - pressing it exports and shares;
  - `null` → `Alert.alert(t.settings.noLogs)` (`Chưa có log nào.` / `No logs yet.`);
  - a failure → `showError`;
  - the row is disabled while working.

## 3. Edge cases

| Situation | Behaviour |
|---|---|
| Disk full or write error | The record is dropped silently; the app is unaffected. |
| Date changes while the app is open | The next flush writes to the new day's file. |
| Device clock moved backwards or forwards | Retention uses file-name dates against the current local date; files dated in the future are kept. |
| Huge error message or stack | Truncated by `redact` and stack ≤ 20 lines. |
| An error whose cause is an image buffer or base64 | Redacted to a marker. |
| A crash before the 2-second flush | `fatal` flushes immediately; buffered `info` may be lost (accepted). |
| Export with only today's log | Works (1 file). |

## 4. Testing

- **Unit:**
  - `redact`: each rule, including **a test that writes records carrying a 3 KB base64 string, a data-URI image and a `Uint8Array`, then asserts the written file content contains no run of ≥ 200 base64 characters and no `data:` prefix**;
  - `formatRecord`/`serializeError`: cause depth 3, stack 20 lines, never throws on circular input;
  - `localIsoTimestamp`/`logFileName` (local date around midnight);
  - `expiredLogFiles`: keep 7 days, ignore other names, keep future dates;
  - logger:
    - timer flush (fake timers);
    - immediate flush on `error`;
    - append into the dated file;
    - the 500-record cap with the overflow record;
    - the 2 MB daily cap;
    - an fs failure never throws;
    - `init` deletes expired files;
  - global handler: logs `fatal`, flushes and calls the previous handler.
- **Integration:**
  - `showError` writes an `error` line with code and file;
  - `scan.tsx` normalizePage fallback writes `warn`;
  - Settings `Gửi log lỗi` calls the share wrapper with the exported uri, and with no logs shows `Chưa có log nào.`;
  - the existing suites stay green.
- **Android emulator:**
  - merge a corrupt PDF, then read `files/logs/<today>.log` through `adb shell run-as com.dlbk.iscanner`. That only works on a debuggable build, so check it on a dev build, or verify through the export share file: the error line holds the code and file name and no base64;
  - plant `2026-09-01.log`, relaunch, and confirm it is deleted;
  - `Gửi log lỗi` opens the share sheet.

## 5. Success criteria

1. Errors, warnings and key events are written to `logs/YYYY-MM-DD.log`. Every popup error is logged with its code.
2. Files older than 7 days are removed on start.
3. No file or image content (bytes, base64, data URIs) can appear in a log; tests prove it.
4. Logging never crashes or blocks the app.
5. Users can send the logs from Settings.
6. All tests and typecheck pass; the flows are verified on the emulator.

# Word (DOC/DOCX) to PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert DOC/DOCX files to PDF on the device, from the library, the merge screen and incoming shares. Password-protected Word files use the same prompt as PDFs.

**Architecture:**
- `src/convert/` holds the pure logic:
  - detection by magic bytes;
  - DOCX → HTML with mammoth, plus the page setup read from the file;
  - DOC → text-only HTML with word-extractor's OLE reader;
  - `convertWordToPdf`, which uses the shared password loop.
- Native work is behind `src/native/` wrappers:
  - `expo-print` writes the PDF file;
  - `officecrypto-tool` decrypts, backed by `react-native-quick-crypto`.
- A converted Word file becomes a cached PDF file. From then on the merge, incoming and library code treats it as an ordinary unlocked PDF.

**Tech Stack:**
- Expo SDK 57, React Native 0.86 (Hermes), TypeScript, Jest with RNTL v14;
- mammoth, word-extractor, officecrypto-tool, expo-print, react-native-quick-crypto (with its peers), buffer;
- `docx` as a devDependency, for test fixtures.

**Spec:** `docs/superpowers/specs/2026-10-09-word-to-pdf-design.md`

## Global Constraints

- All user-facing copy is Vietnamese and English, through `src/i18n/vi.ts` and `en.ts`. Vietnamese letters may appear only in `src/i18n` (a guard test enforces this). There is no `console.*` outside `src/logging`.
- `src/` modules other than `src/components/` and hooks must not import React Native UI. Native packages are imported only inside `src/native/`; tests mock those wrappers.
- Use relative imports. Routes live only in the root `app/`. Never create or edit `android/` or `ios/`; configure through `app.json`.
- Install native/Expo packages with `npx expo install <pkg>`, dev-only tools with `npm install -D`, plain JS libraries with `npm install`. Use npm only.
- Passwords are never logged, persisted, or put into an `AppError`.
- New log events are exactly: `word.converted { file, kind, ms }`, `word.unlocked { file }`, `word.unlockSkipped { file }`.
- `WORD_CONVERT` copy:
  - vi `Không chuyển được file Word` / `File Word bị hỏng hoặc định dạng không được hỗ trợ.`, reason `không chuyển được`;
  - en `Couldn't convert the Word file` / `The Word file is damaged or its format isn't supported.`, reason `conversion failed`.
- `WORD_PASSWORD` copy:
  - vi `Mật khẩu không đúng` / `Mật khẩu của file Word không đúng.`, reason `sai mật khẩu`;
  - en `Wrong password` / `The Word file password is incorrect.`, reason `wrong password`.
- New strings:
  - `library.wordToPdf`: `Word → PDF` (both languages);
  - `library.scanShort`: `Scan` (both languages);
  - `common.convertingWord`: vi `Đang chuyển file Word…`, en `Converting Word file…`.
- Word MIME types:
  - `application/msword`;
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
- iOS UTIs: `org.openxmlformats.wordprocessingml.document`, `com.microsoft.word.doc`.
- Fallback page setup (A4): 595.28 × 841.89 pt, 56.69 pt margins on every side (2 cm).
- Version 1.11.0, versionCode 11, iOS buildNumber "11".
- Before every commit, run `npm test` and `npm run typecheck`; both must pass.
- Never `git add -A`. Leave `requirement/`, `New folder/` and `docs/claude-memory/` untouched.

## Review Focus

1. **A password leak.** No password may appear in logs, errors, settings or the library. This is pinned in Task 4: the log calls are stringified, and errors are checked for the password.
2. **A file named `.docx` that is really a PDF or image, or a non-Word ZIP (`.xlsx`).** The merge and incoming flows must take the right path: PDF/image, or `WORD_CONVERT` / `FILE_UNSUPPORTED`. Pinned in Task 3 (detection) and Task 5 (merge row from PDF bytes named `.docx`).
3. **Encrypted DOCX, wrong password, then right, then skipping the next file.** The first file loads, the second is skipped silently, and no popup appears. Pinned in Task 4.
4. **The PDF password flow after the loop refactor.** It must behave exactly as in 1.10.0. Pinned in Task 4: all existing `mergeWorkflowPassword` and `PasswordPrompt` tests stay unchanged and green.
5. **Cached converted PDFs.** They must be deleted on merge, unmount, skip and failure, like picked copies. Pinned in Task 5 (merge screen `deleteFiles` assertions).

---

### Task 1: Dependencies, shims, native wrappers and errors

**Files:**
- Modify: `package.json`, `metro.config.js` (create it with `getDefaultConfig` if it is missing), `jest.setup.js` (if mocks are needed)
- Create: `src/native/printPdf.ts`, `src/native/officeCrypto.ts`, `src/convert/types.ts`
- Modify: `src/native/pickPdfs.ts`, `src/errors/AppError.ts`, `src/i18n/vi.ts`, `src/i18n/en.ts`
- Test: `__tests__/native/officeCrypto.test.ts`, `__tests__/native/printPdf.test.ts`, `__tests__/errors/AppError.test.ts` (extend), `__tests__/i18n/*` (extend wherever the error keys are enumerated)

**Interfaces:**
- **Produces:**
  - `src/convert/types.ts`:
    - `PageSetup = { width: number; height: number; margin: { top: number; right: number; bottom: number; left: number } }`, in points;
    - `A4_PAGE: PageSetup`;
    - `WordKind = 'docx' | 'docx-encrypted' | 'doc'`.
  - `src/native/printPdf.ts`: `printHtmlToPdf(html: string, page: PageSetup): Promise<string>`. It returns the `file://` URI of the PDF that expo-print wrote in the cache, and passes `width`, `height` and `margins`.
    - **Ruling vs spec §2.2:** it returns the URI, not bytes, so a converted file flows on as a picked PDF copy. Cleanup uses the existing `deleteFiles`.
  - `src/native/officeCrypto.ts`:
    - `isOfficeEncrypted(bytes: Uint8Array): boolean` — `false` on any parse error;
    - `decryptOffice(bytes: Uint8Array, password: string): Promise<Uint8Array>`.
    - Errors: a message matching `/password is incorrect/i` throws `WordPasswordError({ cause })`; anything else throws `WordConvertError({ cause })`.
  - `src/native/pickPdfs.ts`:
    - `WORD_MIME_TYPES` (the two Word types above);
    - `pickDocuments(types: string[]): Promise<PickedPdf[]>`;
    - `pickPdfs()` stays and calls `pickDocuments(['application/pdf'])`.
  - `src/errors/AppError.ts`:
    - `ErrorCode` gains `'WORD_CONVERT' | 'WORD_PASSWORD'`;
    - `WordConvertError` and `WordPasswordError`, with the same `{ index?, fileName?, cause? }` constructor shape as `PdfLoadError`.
  - i18n: `errors.WORD_CONVERT`, `errors.WORD_PASSWORD`, their `errors.reason` entries, `library.wordToPdf`, `library.scanShort` and `common.convertingWord`, all with the Global Constraints copy.

- [ ] **Step 1:** install the packages.
  - `npx expo install expo-print react-native-quick-crypto react-native-nitro-modules react-native-quick-base64`
  - `npm install mammoth word-extractor officecrypto-tool buffer readable-stream`
  - `npm install -D docx`
  - Add `expo-print` to `app.json` plugins only if its docs require it.
  - Run `npx expo-doctor` and record the output in the report. Warnings about the new packages are not blockers.
- [ ] **Step 2: Metro.** Resolve Node built-ins for the app bundle:
  - `crypto` → `react-native-quick-crypto`;
  - `buffer` → `buffer`;
  - `stream` → `readable-stream`;
  - `fs` and `path` → an empty module (`src/native/emptyModule.js`, exporting `{}`).
  - Use `config.resolver.extraNodeModules`. Install the global `Buffer` in `src/native/officeCrypto.ts` only, via `global.Buffer ??= require('buffer').Buffer`. Patching `node_modules` is not allowed.
- [ ] **Step 3: write the failing tests.**
  - **officeCrypto** (real `officecrypto-tool` under Node crypto in Jest):
    - `isOfficeEncrypted(plainDocx)` is false;
    - for a fixture encrypted with `encrypt(docxBuffer, { password: 'secret' })`, `isOfficeEncrypted` is true;
    - `decryptOffice(enc, 'secret')` equals the plain bytes;
    - `decryptOffice(enc, 'nope')` rejects with `WordPasswordError`;
    - `decryptOffice(garbage, 'x')` rejects with `WordConvertError`;
    - the error from a wrong password does not contain `'nope'` in `message` or `JSON.stringify`.
    - Build the plain DOCX with `docx` `Packer.toBuffer`.
  - **printPdf** (with `expo-print` mocked): calls `printToFileAsync` with `{ html, width: 595.28, height: 841.89, margins: { top: 56.69, … } }` for `A4_PAGE`, and returns the mocked `uri`.
  - **AppError and i18n:** the new codes exist; the vi/en copy is exact; the error-key coverage tests include the new codes.
- [ ] **Step 4:** run the new tests and confirm they FAIL.
- [ ] **Step 5:** implement the wrappers, types, errors and copy.
- [ ] **Step 6:** run the tests and confirm they PASS; then `npm test` and `npm run typecheck`.
- [ ] **Step 7:** commit with `feat: Word conversion dependencies, native wrappers and errors`.

### Task 2: On-device feasibility gate (controller)

**Files:** a throwaway probe route that is **never committed**, for example `app/__probe.tsx`, deleted after the run. Ledger notes only.

**Interfaces:**
- **Consumes:** Task 1's wrappers and Metro shims.

- [ ] **Step 1:** write the probe screen. On mount it:
  1. builds a tiny DOCX in memory, or bundles one;
  2. runs mammoth `convertToHtml({ arrayBuffer })`;
  3. runs `printHtmlToPdf(html, A4_PAGE)`;
  4. runs `isOfficeEncrypted` and `decryptOffice` on a bundled DOCX encrypted with `secret` (generated with officecrypto-tool in Node);
  5. runs word-extractor's OLE path on the bundled `.doc` fixture from Task 3 Step 0.

  It renders each step's result and duration in ms.
- [ ] **Step 2:** `npx expo prebuild --platform android --no-install`, then Gradle `assembleRelease`. Install on `iscanner_pixel` and open the probe with `adb shell am start -d iscanner:///__probe` (or the app scheme), then take a screenshot.
- [ ] **Step 3: gate.** All steps must succeed, and decrypt must take under 2000 ms. Then delete the probe and ledger the result.
  - If quick-crypto fails to build or link, or decrypt is slow, the ruling is a local Expo module `modules/office-crypto` (Kotlin `MessageDigest`/`Cipher`, Swift CommonCrypto). It exposes `iteratedHash(algorithm, salt, password, spin)` and `aesCbcDecrypt(key, iv, data)`, and `crypto` is shimmed onto it. Insert a Task 2b for that, then re-run this gate.
  - If word-extractor's OLE path cannot run on Hermes, rule `.doc` → `WORD_CONVERT`. Record it, update the spec §1 row, and drop the `.doc` steps in Task 3.

### Task 3: Detection and HTML conversion

**Files:**
- Create: `src/convert/detect.ts`, `src/convert/html.ts`, `__tests__/fixtures/word.ts`
- Add: `__tests__/fixtures/sample.doc`
- Test: `__tests__/convert/detect.test.ts`, `__tests__/convert/html.test.ts`

**Interfaces:**
- **Consumes:** `PageSetup`, `A4_PAGE`, `WordKind` (Task 1).
- **Produces:**
  - `detectWordKind(bytes: Uint8Array): WordKind | null`;
  - `escapeHtml(s: string): string`;
  - `readDocxPageSetup(bytes: Uint8Array): Promise<PageSetup>`;
  - `docxToHtml(bytes: Uint8Array): Promise<{ html: string; page: PageSetup }>`;
  - `docToHtml(bytes: Uint8Array): Promise<{ html: string; page: PageSetup }>`;
  - fixtures:
    - `makeDocx(opts?: { pageSize?: 'A4' | 'Letter'; withImage?: boolean; text?: string }): Promise<Uint8Array>`;
    - `makeEncryptedDocx(password = 'secret'): Promise<Uint8Array>`;
    - `SAMPLE_DOC_PATH`.

- [ ] **Step 0 (controller, before dispatch):** fetch a small MIT/public-domain `.doc` (≤ 30 KB, Word 97–2003) into `__tests__/fixtures/sample.doc` — for example from the word-extractor repository's test data. Record its source and licence, and its expected first line of text, in the ledger and the brief.
- [ ] **Step 1: write the failing tests.**
  - **detect:**
    - `makeDocx()` → `docx`;
    - `makeEncryptedDocx()` → `docx-encrypted`;
    - `sample.doc` → `doc`;
    - `%PDF-1.4…` → `null`;
    - PNG bytes → `null`;
    - a ZIP with only `xl/workbook.xml` (built with jszip) → `null`;
    - 3 random bytes → `null`;
    - an empty array → `null`.
  - **html:**
    - `docxToHtml(makeDocx())`: the HTML contains `<h1>`, `<strong>`, `<table>` and the Vietnamese text unchanged; `page` equals A4 within 0.5 pt;
    - `withImage` → it contains `src="data:image/png;base64,`;
    - `pageSize: 'Letter'` → `page.width` ≈ 612 and `page.height` ≈ 792;
    - the HTML contains `@page { size: 612pt 792pt` for Letter;
    - a DOCX missing `w:pgSz` (strip it with jszip) → `A4_PAGE`;
    - `docToHtml(sample.doc)`: it contains the expected first line inside a `<p>`, and the `<`, `&` from a crafted string are escaped (test `escapeHtml` directly: `escapeHtml('<a&"b>')` → `'&lt;a&amp;&quot;b&gt;'`).
- [ ] **Step 2:** run the tests → FAIL.
- [ ] **Step 3:** implement.
  - **detect:** check the ZIP magic `50 4B 03 04`, then look for `word/document.xml` with jszip (a dependency of mammoth; add it explicitly with `npm install jszip`). For CFB `D0 CF 11 E0 A1 B1 1A E1`, read the directory with `cfb` (a dependency of officecrypto-tool; add it explicitly): `EncryptedPackage` → `docx-encrypted`, `WordDocument` → `doc`.
  - **html:**
    - mammoth `convertToHtml({ arrayBuffer })` with `convertImage: mammoth.images.dataUri`;
    - page setup from `w:sectPr` `w:pgSz` `w:w`/`w:h` and `w:pgMar`, in twips ÷ 20 = pt; non-positive or missing values → `A4_PAGE`;
    - the wrapper document carries the print CSS from spec §2.1;
    - `.doc` → word-extractor's buffer-based extract `getBody()`, split on `\n`, with non-empty lines → `<p>` + `escapeHtml`.
- [ ] **Step 4:** run the tests → PASS, then `npm test` and `npm run typecheck`.
- [ ] **Step 5:** commit with `feat: detect Word files and convert them to HTML`.

### Task 4: Shared password loop and `convertWordToPdf`

**Files:**
- Create: `src/workflows/passwordLoop.ts`, `src/convert/convertWord.ts`
- Modify: `src/workflows/mergeWorkflow.ts` (`openPdfWithPassword` delegates to the loop)
- Test: `__tests__/workflows/passwordLoop.test.ts`, `__tests__/convert/convertWord.test.ts`. The existing `__tests__/workflows/mergeWorkflowPassword.test.ts` and `mergeWorkflowErrors.test.ts` stay **unchanged** and must pass.

**Interfaces:**
- **Consumes:**
  - Task 1: `printHtmlToPdf`, `decryptOffice`, `isOfficeEncrypted`, `WordConvertError`, `WordPasswordError`;
  - Task 3: `detectWordKind`, `docxToHtml`, `docToHtml`;
  - existing: `getPdfPageCount`, `AskPassword`, `ReadBytes`.
- **Produces:**
  - ```
    withPasswordLoop<T>(
      open: (password: string | undefined) => Promise<T>,
      opts: {
        fileName: string;
        ask?: AskPassword;
        known?: string;
        needsPassword: (e: unknown) => boolean;
        wrongPassword: (e: unknown) => boolean;
        event: 'pdf' | 'word';
      },
    ): Promise<{ value: T; password?: string } | null>
    ```
    It is the exact algorithm of today's `openPdfWithPassword`:
    1. try `open(known)`;
    2. on needs/wrong, try `''` silently once;
    3. then ask, with `wrongBefore` only after a typed password failed;
    4. a non-string answer → log `${event}.unlockSkipped` and return `null`;
    5. a success with a password → log `${event}.unlocked`;
    6. when `ask` is absent, rethrow the first error.
  - `openPdfWithPassword(bytes, fileName, ask?, known?)` keeps its signature and result shape.
  - `WordDeps = { readBytes: ReadBytes; printHtmlToPdf: (html: string, page: PageSetup) => Promise<string>; decryptOffice: (b: Uint8Array, p: string) => Promise<Uint8Array>; isOfficeEncrypted: (b: Uint8Array) => boolean; askPassword?: AskPassword }`
  - `convertWordToPdf(deps: WordDeps, file: { uri: string; name: string; password?: string }): Promise<{ uri: string; pageCount: number } | null>`
    - Behaviour:
      - a kind of `null` → `WordConvertError({ fileName })`;
      - `docx-encrypted`, or `doc` where `isOfficeEncrypted` is true, → decrypt through `withPasswordLoop`, with `needsPassword` = "no password given" and `wrongPassword` = `WordPasswordError`;
      - HTML → `printHtmlToPdf` → `readBytes(uri)` → `getPdfPageCount`;
      - logs `word.converted { file, kind, ms }`;
      - any non-AppError error → `WordConvertError({ fileName, cause })`.
    - **Ruling vs spec §2.1:** it returns `{ uri, pageCount }`, not bytes (see the Task 1 ruling).

- [ ] **Step 1: write the failing tests.**
  - **passwordLoop**, with a fake `open`:
    - succeeds with no password → no ask, no log;
    - needs a password, `''` works → no ask, logs `.unlocked`;
    - wrong, then right → asks `(name, false)` then `(name, true)`;
    - skip → `null` and `.unlockSkipped`;
    - no `ask` → rethrows the first error;
    - a known password that is wrong → `''` is tried, then the ask has `wrongBefore = true`.
  - **convertWord**, with real detect/html, a mocked `printHtmlToPdf` that returns a URI whose `readBytes` gives a real 2-page pdf-lib PDF, and the real `officeCrypto` functions:
    - plain DOCX → `{ uri, pageCount: 2 }`, the HTML passed contains the fixture text, and no ask happens;
    - encrypted DOCX with the answer `secret` first → converted;
    - answers `nope` then `secret` → asks with `false` then `true`;
    - skip → `null`;
    - a garbage file named `x.docx` → `WordConvertError` with `fileName` `x.docx`;
    - `printHtmlToPdf` rejects → `WordConvertError` with the file name;
    - after the encrypted cases, `JSON.stringify(log mock calls)` contains neither `secret` nor `nope`;
    - `sample.doc` → converted, and the HTML contains its first line.
  - **Review Focus 3:** in `loadPickedFiles` (Task 5), wrong, then right, then skip the next file is covered there. This task only proves the loop primitives.
- [ ] **Step 2:** run the tests → FAIL.
- [ ] **Step 3:** implement. `openPdfWithPassword` becomes a thin wrapper around `withPasswordLoop`, with `needsPassword` = `PdfEncryptedError` and `wrongPassword` = `PdfPasswordError`.
- [ ] **Step 4:** run the tests → PASS (including the unchanged existing password tests), then `npm test` and `npm run typecheck`.
- [ ] **Step 5:** commit with `feat: convert Word files to PDF with the shared password loop`.

### Task 5: Merge and incoming flows, plus `app.json` file types

**Files:**
- Modify: `src/workflows/mergeWorkflow.ts`, `app/merge.tsx`, `src/share/classify.ts`, `src/share/types.ts`, `src/share/plan.ts`, `app/incoming.tsx`, `app.json`
- Test: `__tests__/workflows/mergeWorkflowWord.test.ts`, `__tests__/app/mergeWord.test.tsx`, `__tests__/share/classify.test.ts` (extend), `__tests__/share/plan.test.ts` (extend), `__tests__/app/incomingWord.test.tsx`, `__tests__/config/appJson.test.ts` (create it or extend an existing app.json test)

**Interfaces:**
- **Consumes:** `convertWordToPdf`, `WordDeps` (Task 4), `detectWordKind` (Task 3), `pickDocuments`, `WORD_MIME_TYPES` (Task 1).
- **Produces:**
  - `loadPickedFiles(deps: { readBytes; askPassword?; word?: Omit<WordDeps, 'readBytes' | 'askPassword'> }, files: PickedPdf[]): Promise<{ loaded: LoadedPdf[]; failed: AppError[]; skipped: string[]; converted: string[] }>`
    - When the read bytes are Word and `deps.word` is present, it converts them. The `LoadedPdf` gets `uri` = the converted PDF and keeps the original `name`, with no password. `converted` lists the new cache URIs, so callers delete them.
    - When `deps.word` is absent, a Word file is `WordConvertError`.
    - `loadPickedPdfs` stays as an alias that passes no `word`.
  - `classifyIncoming` returns `'pdf' | 'image' | 'word' | 'unsupported'`; it is `'word'` when `detectWordKind ≠ null`.
  - `IncomingFile.kind` gains `'word'`.
  - `planIncoming` treats `'word'` like `'pdf'` (`single-pdf` / `merge` buckets keep their names).

- [ ] **Step 1: write the failing tests.**
  - **Workflow:**
    - PDF + plain DOCX → 2 loaded, the Word row's `uri` is the converted URI, `converted` has 1 entry;
    - an encrypted DOCX answered wrong, then right, followed by an encrypted DOCX that is skipped → 1 loaded, 1 skipped, `failed` empty (Review Focus 3);
    - a PDF named `fake.docx` → loaded as a PDF and nothing converted (Review Focus 2);
    - an `.xlsx` ZIP (built with jszip) → `failed[0].code` is `WORD_CONVERT`, with the file name (spec §4);
    - garbage bytes → `PDF_LOAD`, as today.
  - Routing rule: PDF magic → PDF path; otherwise ZIP or CFB magic → Word path (a non-Word container becomes `WordConvertError`); otherwise → PDF path (`PDF_LOAD`).
  - **Merge screen** (`pickDocuments` mocked, real workflow, `printHtmlToPdf` mocked as in Task 4):
    - the picker is called with `['application/pdf', ...WORD_MIME_TYPES]`;
    - picking PDF + DOCX shows 2 rows with their original names and pages;
    - Merge stores 1 document;
    - `deleteFiles` receives the converted URI on merge, and also on unmount (Review Focus 5);
    - a Word file whose conversion fails shows a popup with `WORD_CONVERT` and the file name.
  - **classify / plan:**
    - `makeDocx()` → `'word'`, `sample.doc` → `'word'`, an xlsx ZIP → `'unsupported'`;
    - one word → `single-pdf`; word + pdf → `merge`; word + image → `single-pdf` with images.
  - **Incoming:**
    - a single encrypted DOCX share → prompt → `secret` → the confirm view shows the original name and the page count;
    - Save stores the converted PDF bytes;
    - "Merge with other files" puts the converted URI (kind `pdf`, no password) in the pending store;
    - skip → the existing "nothing usable" path.
  - **app.json:**
    - Android VIEW `intentFilters` data include both Word MIME types;
    - `expo-sharing` single/multiple lists include them;
    - iOS `CFBundleDocumentTypes` has an entry with both UTIs.
- [ ] **Step 2:** run the tests → FAIL.
- [ ] **Step 3:** implement.
  - Wire `word` deps from `src/native` in both screens.
  - Show `t.common.convertingWord` as the busy label while converting, if the screen has a label slot; otherwise the existing spinner.
  - Delete the converted URIs wherever picked copies are deleted today.
  - Edit `app.json`.
- [ ] **Step 4:** run the tests → PASS, then `npm test` and `npm run typecheck`.
- [ ] **Step 5:** commit with `feat: accept Word files in merge and incoming shares`.

### Task 6: Library `Word → PDF` button and version 1.11.0

**Files:**
- Modify: `app/index.tsx`, `src/library/LibraryContext.tsx` (only if an add helper is needed), `app.json`, `__tests__/plugins/withReleaseSigning.test.ts` (version asserts)
- Create: `src/workflows/wordWorkflow.ts`
- Test: `__tests__/workflows/wordWorkflow.test.ts`, `__tests__/app/indexWord.test.tsx`

**Interfaces:**
- **Consumes:** `convertWordToPdf`, `WordDeps` (Task 4), `pickDocuments`, `WORD_MIME_TYPES` (Task 1), `LibraryStore.add`.
- **Produces:** `convertWordFilesToLibrary(deps: WordDeps & { library: Pick<LibraryStore, 'add'>; deleteFiles: (uris: string[]) => Promise<void> }, files: PickedPdf[]): Promise<{ saved: DocumentMeta[]; failed: AppError[]; skipped: string[] }>`
  - each document is named after the file name without its extension; an empty base name falls back to `t.common.untitled` via the screen;
  - `source: 'merge'`, unless `DocumentMeta.source` allows adding `'word'`. Check `src/library/types.ts`: if `source` is a closed union used by the UI, add `'word'`; otherwise reuse `'merge'`, and ledger the choice;
  - converted cache files are deleted after saving, and on failure.

- [ ] **Step 1: write the failing tests.**
  - **Workflow:**
    - 2 DOCX → 2 saved, with names `hop-dong` and `bao-cao` for `hop-dong.docx` and `bao-cao.DOCX`;
    - one corrupt → 1 saved and 1 failed with the file name;
    - an encrypted DOCX skipped → listed in `skipped`, with no failure;
    - `deleteFiles` was called with every converted URI.
  - **Library screen:**
    - 3 buttons in the bottom bar: `Scan tài liệu` (or `Scan`), `Gộp PDF`, `Word → PDF` (vi), and `Word → PDF` (en);
    - pressing it calls `pickDocuments(WORD_MIME_TYPES)`;
    - with 1 file → `router.push` to the viewer of the saved document;
    - with 2 files → stays, and both appear in the list;
    - with a failure → `showError` once with the file name;
    - selection mode hides the bottom bar as today.
  - **Version:** `app.json` is 1.11.0 / 11 / "11", and the tests that assert the version are updated.
- [ ] **Step 2:** run the tests → FAIL.
- [ ] **Step 3:** implement.
  - The three buttons get equal flex.
  - Use `t.library.scanShort` for the scan button only when the full label is longer than 12 characters, in either language. Decide this statically in the component, not by measuring.
  - Render `usePasswordPrompt().element` on the library screen.
- [ ] **Step 4:** run the tests → PASS, then `npm test` and `npm run typecheck`.
- [ ] **Step 5:** commit with `feat: Word to PDF from the library`.

### Task 7: Device verification and docs (controller)

- [ ] **Step 1:** prebuild Android, build the release APK, install it and push to `/sdcard/Download`:
  - a DOCX exported from Google Docs (or generated with headings, a table and an image);
  - an encrypted DOCX (`secret`);
  - `sample.doc`.
- [ ] **Step 2:** check each entry point:
  - **Library:** `Word → PDF` with 1 file → the viewer shows the content; with the encrypted file → wrong, then right → the content shows.
  - **Merge:** a PDF plus a DOCX gives one merged document.
  - **Share:** a DOCX shared from Files gives the confirm view, then Save.

  Measure the decrypt-to-viewer time. Screenshot each step.
- [ ] **Step 3:** README: add the 1.11.0 feature line and checklist, and add a "Giới hạn" note (layout not preserved; `.doc` text only). Write the progress log `docs/superpowers/progress/2026-10-09-word-to-pdf.md`. Run `npm test` and `npm run typecheck`, then commit with `docs: Word to PDF — README 1.11.0 and progress log`.

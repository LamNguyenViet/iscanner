# iScanner — Word (DOC/DOCX) to PDF — Design Spec

- **Date:** 2026-10-09
- **Source:** requirement "09/10/2026 - sequence 1", part 2 of 4: "tính năng thêm convert từ doc, docx sang pdf, trường hợp doc, docx dùng mật khẩu cũng mở ô nhập như pdf."
- **Builds on:**
  - the password prompt and ask loop from 1.10.0 (`usePasswordPrompt`, `openPdfWithPassword`);
  - typed errors, i18n and logging;
  - the merge, incoming and library flows.
- **Status:** approved in chat (spike → option a, all entry points, three buttons, approach A); awaiting written-spec review.

## 1. Goal and decisions

Users can turn Word documents into PDFs on the device: from the library, inside a merge, and when files are shared to the app. A password-protected Word file shows the same password prompt as a PDF.

| Topic | Decision |
|---|---|
| Conversion | **On device**. Nothing is uploaded. DOCX goes through `mammoth` to HTML, then `expo-print` turns the HTML into a PDF. The PDF keeps the structure: headings, bold/italic, lists, tables and embedded images. It does **not** keep the exact page layout: headers/footers, text boxes, columns, page breaks and fonts are lost. |
| `.doc` (Word 97–2003) | **Text only.** `word-extractor` produces the body text, each paragraph becomes a `<p>`, and the result is printed. |
| Encrypted files | `officecrypto-tool` decrypts DOCX (ECMA-376 Agile/Standard, AES) and DOC (RC4 / RC4 CryptoAPI). Hashing must be native for speed: the spike measured 100 000 × SHA-512 at ≈24 s in pure JS, which is too slow. `react-native-quick-crypto` is the primary choice, and a small local Expo module is the fallback (see §5). |
| Page size | Read from the DOCX (`w:sectPr/w:pgSz`, `w:pgMar`, in twips). Missing or invalid values fall back to A4 with 2 cm margins. `.doc` always uses A4. |
| Entry points | Library button `Word → PDF`; the merge picker; incoming shares (all three, decision a). |
| Library layout | Three equal buttons in the bottom bar (decision a). |
| Version | 1.11.0, versionCode 11, iOS buildNumber "11". |

Out of scope:
- exact page layout (headers/footers, text boxes, columns);
- `.doc` formatting and images;
- RTF, ODT, XLSX and PPTX;
- creating password-protected output.

## 2. Modules

### 2.1 `src/convert/` (pure logic, no UI, no native imports)

- **`detectWordKind(bytes): 'docx' | 'docx-encrypted' | 'doc' | null`**
  - ZIP (`PK\x03\x04`) that contains `word/document.xml` → `docx`. A ZIP without it → `null`.
  - OLE/CFB (`D0 CF 11 E0 A1 B1 1A E1`):
    - a stream named `EncryptedPackage` → `docx-encrypted`;
    - a `WordDocument` stream → `doc`. Encryption of a `.doc` is detected later, by the decrypt step, through the FIB `fEncrypted` flag (via `officecrypto-tool.isEncrypted`).
  - Anything else → `null`.
- **`docxToHtml(bytes): Promise<{ html: string; page: PageSetup }>`**
  - mammoth `convertToHtml` with images as data URIs;
  - `page` comes from the first `w:sectPr` (`pgSz w/h`, `pgMar top/right/bottom/left`, in twips, converted to points), with an A4 fallback;
  - wraps the body with `<!doctype html><meta charset="utf-8">`, a print CSS `@page { size: Wpt Hpt; margin: … }`, a sans-serif base font, `img { max-width: 100% }` and bordered tables.
- **`docToHtml(bytes): Promise<{ html; page: A4 }>`**: word-extractor `getBody()`, split on blank lines/newlines into escaped `<p>` paragraphs.
- **`escapeHtml(s)`** is shared.
- **`convertWordToPdf(deps, file): Promise<{ bytes: Uint8Array; pageCount: number } | null>`**
  - `deps = { readBytes; printHtmlToPdf; decryptOffice; isOfficeEncrypted; askPassword? }`;
  - `file = { uri; name; password? }`.
  - Steps:
    1. Read the bytes and detect the kind. `null` → `WordConvertError`.
    2. If encrypted, run the **shared ask loop**:
       - try `''` silently, then a carried password;
       - then ask, with `wrongBefore` only after a typed password has failed;
       - a skip returns `null`.
    3. Convert to HTML.
    4. `printHtmlToPdf(html, page)`.
    5. Count the pages with `getPdfPageCount`.
  - Logs `word.converted { file, kind, ms }` and `word.unlockSkipped { file }`. The password is never logged and never put in an error.
- **Shared ask loop:** the existing `openPdfWithPassword` loop is generalised to `withPasswordLoop(open, fileName, ask?, known?)`, where `open(password?)` throws a *needs-password* or *wrong-password* error. PDF and Word both use it, and the PDF behaviour is unchanged.

### 2.2 Native wrappers (`src/native/`, mocked in tests)

- **`printPdf.ts`** (`printHtmlToPdf(html, page) → Uint8Array`):
  - calls `expo-print` `printToFileAsync({ html, width, height, margins })`;
  - margins are honoured on iOS, and on Android through the CSS `@page`;
  - reads the file bytes, then deletes the temporary file.
- **`officeCrypto.ts`** (`isOfficeEncrypted(bytes)`, `decryptOffice(bytes, password)`):
  - wraps `officecrypto-tool` with `Buffer` and a native `crypto` (quick-crypto);
  - maps "password is incorrect" to a *wrong-password* error, and anything else to `WordConvertError`.
- The DOC/DOCX picker extends `pickPdfs.ts` into `pickDocuments(types)`.

### 2.3 Errors and copy

- **`WordConvertError`** (`WORD_CONVERT`):
  - vi: `Không chuyển được file Word` / `File Word bị hỏng hoặc định dạng không được hỗ trợ.`, short reason `không chuyển được`;
  - en: `Couldn't convert the Word file` / `The Word file is damaged or its format isn't supported.`, reason `conversion failed`.
- **`WordPasswordError`** (`WORD_PASSWORD`):
  - vi: `Mật khẩu không đúng` / `Mật khẩu của file Word không đúng.`, reason `sai mật khẩu`;
  - en: `Wrong password` / `The Word file password is incorrect.`, reason `wrong password`.
  - Normally handled by the prompt; only a fallback.
- **New strings:**

  | Key | vi | en |
  |---|---|---|
  | `library.wordToPdf` | `Word → PDF` | `Word → PDF` |
  | `library.scanShort` | `Scan` | `Scan` |
  | `common.convertingWord` | `Đang chuyển file Word…` | `Converting Word file…` |

  `library.scanShort` is used only if the full label does not fit three buttons.
- The prompt reuses `t.pdfPassword` (its wording is generic).

## 3. Flows

- **Library — `Word → PDF`:**
  - pick DOC/DOCX (multiple allowed), then convert each in turn: busy spinner, password prompt when needed;
  - each result is saved as its own document, named after the file name without its extension;
  - 1 saved → open the viewer; several → stay on the library;
  - failures are collected into one `showError`; skips are silent.
- **Merge:**
  - the picker accepts PDF + DOC + DOCX;
  - `loadPickedPdfs` becomes `loadPickedFiles`: a Word file is converted to a cached PDF on pick (prompting when needed), then treated as an unlocked PDF;
  - the row shows the original name and the page count, and merging needs ≥ 2 rows as today;
  - converted cache files are deleted with the other copies.
- **Incoming:**
  - `classifyIncoming` returns `'word'` for `detectWordKind ≠ null` (`IncomingFile.kind` gains `'word'`);
  - planning treats Word like PDF: a single Word file gets the confirm view (convert first, with the prompt), then `Lưu vào thư viện` stores the converted PDF, or `Gộp với file khác` hands the converted PDF to merge;
  - several files that include Word go to merge, which converts them;
  - a skip with nothing else usable gives the existing "nothing usable" path.
- **Configuration (`app.json` only; `android/` and `ios/` are generated):**
  - Android VIEW `intentFilters` gain `application/msword` and `application/vnd.openxmlformats-officedocument.wordprocessingml.document`;
  - `expo-sharing` single/multiple share mime types gain the same two;
  - iOS `CFBundleDocumentTypes` gains a `Word` entry with `org.openxmlformats.wordprocessingml.document` and `com.microsoft.word.doc`;
  - native/Expo packages are added with `npx expo install`: `expo-print`, `react-native-quick-crypto` and its peers.

## 4. Edge cases

| Situation | Behaviour |
|---|---|
| `.docx` that is really a PDF or image (wrong extension) | Detection uses magic bytes, so it follows the PDF/image path. |
| ZIP that is not Word (`.xlsx`, `.zip`) | `WORD_CONVERT` in the merge or library flow; `FILE_UNSUPPORTED` in the incoming flow (as today). |
| Empty document | A 1-page blank PDF. |
| Huge DOCX (many images) | The 100 MB cap stays. Conversion runs under the busy spinner. Out-of-memory is not specially handled. |
| Encrypted `.doc` with an unsupported scheme (XOR obfuscation) | `WORD_CONVERT` with the file name. |
| Read-only (owner-restricted) or "protect editing" DOCX | Not encrypted, so it converts directly with no prompt. |
| User leaves the screen during a prompt | Same as PDF: the prompt resolves `null` and the flow stops. |

## 5. Risks and mitigations

1. **`react-native-quick-crypto` fails to build or link with RN 0.86 / Expo 57.**
   - The plan's first task proves it with an Android release build plus a timing probe (target: decrypt < 2 s on the emulator).
   - On failure, the ruling switches to a local Expo module, `modules/office-crypto`. It exposes only an iterated SHA-512 or SHA-1 and an AES-CBC decrypt, using Kotlin `MessageDigest`/`Cipher` and Swift CommonCrypto. iOS is verified only by the CI IPA build.
2. **Node-only code in mammoth, word-extractor or officecrypto-tool on Hermes.**
   - The same first task runs all three in the release build.
   - Shims are allowed: the `buffer` package, a bytes-based reader in place of `fs`, and quick-crypto as `crypto`. They are configured in the Metro resolver, not by patching `node_modules`.
3. **`expo-print` ignores margins on Android.** The CSS `@page` carries them.
4. **APK size:** about +1–3 MB of JS, which is acceptable.

## 6. Testing

- **Fixtures:**
  - DOCX built in tests with the `docx` package (devDependency): a heading, bold text, Vietnamese text, a table and a small PNG, plus a Letter-size variant;
  - encrypted DOCX via `officecrypto-tool.encrypt` (Node crypto under Jest);
  - a small committed `.doc` fixture (≤ 30 KB) in `__tests__/fixtures/`, made with LibreOffice. If none is available, the controller sources one.
- **Unit tests:**
  - `detectWordKind` on each kind, PDF, PNG, a non-Word ZIP and garbage;
  - `docxToHtml`: elements, a `data:` image, page size (A4 and Letter), the fallback, escaping;
  - `docToHtml`: paragraphs and escaping;
  - `convertWordToPdf` with a mocked `printHtmlToPdf`:
    - HTML passed through and page count;
    - right password first time;
    - wrong then right (`wrongBefore`);
    - skip → `null`;
    - corrupt → `WordConvertError` with the file name;
    - logs never contain the password;
  - the PDF ask loop is unchanged after the refactor (existing tests stay green).
- **Screens:**
  - library: the third button; 2 files make 2 documents; 1 file opens the viewer;
  - merge: PDF + DOCX gives 2 rows, then 1 merged PDF;
  - incoming: one encrypted DOCX, the prompt, then Save;
  - `app.json`: the mime types and UTIs are present.
- **Device (Android emulator, release APK):**
  - a real DOCX (Word and Google Docs export), an encrypted DOCX and a `.doc`, through all three entry points;
  - measure the decrypt time.

## 7. Success criteria

1. DOC/DOCX files convert to PDF on the device from the library, the merge screen and shares.
2. Password-protected DOC/DOCX files show the same prompt as PDFs. A wrong password re-prompts, and the user can always skip.
3. Decrypting a password-protected DOCX takes under 2 s on the emulator.
4. Nothing is uploaded, and passwords are never persisted or logged.
5. All tests and the typecheck pass, and the flows are verified on the emulator.

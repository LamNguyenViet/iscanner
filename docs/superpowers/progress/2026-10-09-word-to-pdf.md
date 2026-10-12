# Progress — Word (DOC/DOCX) to PDF (09/10/2026 sequence 1, part 2 of 4)

- **Spec:** `docs/superpowers/specs/2026-10-09-word-to-pdf-design.md`. It started with a feasibility spike; the user chose on-device conversion, all three entry points, and three library buttons.
- **Plan:** `docs/superpowers/plans/2026-10-09-word-to-pdf.md`. It had 7 tasks plus a controller-inserted Task 2b, run subagent-driven. Sonnet implemented Tasks 1, 3, 4, 5 and 6, and Opus implemented Task 2b. Reviews ran on Sonnet, or on Opus for Tasks 4 and 5 and the whole branch.
- **Branch:** `feat/word-to-pdf`, from master `ae79791`.
- **Version:** 1.11.0, versionCode 11, iOS buildNumber "11".
- **Requirement 09/10 seq 1:** all four parts are done:
  - 4: multi-select delete, 1.8.0;
  - 3: settings cards, 1.9.0;
  - 1: password-protected PDF merge, 1.10.0;
  - 2: Word to PDF, 1.11.0.

## What was built

- **Dependencies:**
  - Expo and native, installed with `expo install`: `expo-print`, `react-native-quick-crypto`, `react-native-nitro-modules`, `react-native-quick-base64`.
  - Plain JS: `mammoth`, `word-extractor`, `officecrypto-tool`, `jszip`, `cfb`, `buffer`, `readable-stream`, and browser shims for `timers`, `events`, `string_decoder`, `util` and `path`.
  - Dev: `docx`, used to build test fixtures.
  - `metro.config.js` maps the Node built-ins through `extraNodeModules`: `crypto` to quick-crypto, `fs` to an empty module, and the rest to the shims above. Jest still uses Node's real `crypto`.
- **`modules/office-crypto/` (local Expo module):**
  - It provides `iteratedHash(algorithm, initialBase64, spinCount)`, which runs the ECMA-376 password spin loop (`h = HASH(le32(i) ‖ h)`) in one native call. It uses Kotlin `MessageDigest` on Android and Swift CommonCrypto on iOS.
  - A module-local `.gitignore` excludes `android/build/`.
- **`src/convert/` (pure):**
  - `types.ts`: `PageSetup` and `A4_PAGE` (595.28 × 841.89 pt, 56.69 pt margins).
  - `detect.ts`: `detectWordKind`, which works from magic bytes. It finds DOCX by reading the ZIP central directory by hand and looking for `word/document.xml`. It reads CFB with `cfb`, where `EncryptedPackage` means `docx-encrypted` and `WordDocument` means `doc`.
  - `html.ts`:
    - `docxToHtml` uses mammoth, with images as data URIs, and takes the page setup from `w:pgSz` and `w:pgMar`;
    - the print CSS has `@page`, a sans-serif font, `img { max-width: 100% }` and bordered tables;
    - `docToHtml` uses word-extractor's OLE path only (`lib/word-ole-extractor` and `lib/buffer-reader`), producing escaped `<p>` paragraphs.
  - `agileDecrypt.ts`: an ECMA-376 Agile decryptor (MS-OFFCRYPTO §2.3.4.10–15) with injected `iteratedHash`, `hash` and `aesCbcDecrypt`. It checks the verifier, unwraps the key, and decrypts the 4096-byte segments.
  - `convertWord.ts`: `convertWordToPdf(deps, file)` returns `{ uri, pageCount }`, or `null` when the user skips.
    1. It detects the file kind.
    2. If the file is encrypted, it decrypts it through `withPasswordLoop`.
    3. It converts the file to HTML.
    4. It runs `printHtmlToPdf`, then counts the pages.
    5. It logs `word.converted { file, kind, ms }`.
- **`src/native/`:**
  - `printPdf.ts` (expo-print) returns a cache URI.
  - `officeCrypto.ts`: Agile files go to our decryptor, which uses the native spin loop and quick-crypto AES. Everything else (Standard encryption, `.doc` RC4) goes to officecrypto-tool. A wrong password throws `WordPasswordError()` with no cause.
  - `officeCryptoNative.ts`, `wordDeps.ts`, and `pickDocuments(types)` with `WORD_MIME_TYPES`.
- **`src/workflows/passwordLoop.ts`:** `withPasswordLoop` is the 1.10.0 PDF loop extracted unchanged.
  - Order: known password, then `''` silently, then ask. `wrongBefore` is set only after a typed password fails.
  - It logs `${event}.unlocked` and `${event}.unlockSkipped`.
  - `openPdfWithPassword` now delegates to it.
- **Errors and copy:**
  - `WordConvertError` (`WORD_CONVERT`) and `WordPasswordError` (`WORD_PASSWORD`), with vi/en copy.
  - `library.wordToPdf` and `library.scanShort`, and `common.convertingWord`.
- **Merge:**
  - `loadPickedFiles` routes each file: PDF magic goes to the PDF path; ZIP or CFB goes to Word, and a non-Word container gives `WORD_CONVERT`; anything else gives `PDF_LOAD`.
  - A converted file becomes a cached PDF row that keeps the original name.
  - The picker accepts PDF and Word files.
  - Converted copies are deleted on merge and on unmount.
- **Incoming:**
  - `classifyIncoming` returns `'word'`, and planning treats it like a PDF.
  - A single Word file is converted (prompting for a password if needed) and then shown in the confirm view. Save stores the converted PDF. "Gộp với file khác" hands the converted URI over as a `pdf`.
- **Library:**
  - The bottom bar has three buttons: `Scan` · `Gộp PDF` · `Word → PDF`.
  - `convertWordFilesToLibrary` makes one document per file, named after the file without its extension.
  - With one file it opens the viewer, guarded by a focus ref. Failures go to a single `showError`.
  - While converting, a spinner shows and the other buttons are locked.
- **`app.json`:**
  - the Android VIEW intent filter and the expo-sharing single and multiple lists gain `application/msword` and the DOCX MIME type;
  - the iOS `CFBundleDocumentTypes` gains a Word entry with both UTIs;
  - the version is 1.11.0.

## Verification

- `npm test` passes: 87 suites, 845 tests. `npm run typecheck` is clean, and `npx expo export --platform android` bundles.
- **Device gate (Task 2):** a throwaway probe route in a release APK, which was never committed.
  - The first build failed with `Unable to resolve module timers` from xml2js. Shims were added.
  - The first probe run decrypted in 3.5 s. Every step worked, but decryption missed the target.
  - After Task 2b (native spin loop and Agile decryptor), the timings were:

    | Step | Time |
    |---|---|
    | mammoth | 122 ms |
    | expo-print | 2.2 s, 1 page |
    | decrypt | 159 ms |
    | wrong password | 252 ms |
    | `.doc` | 422 ms |

- **Device check (Task 7), release 1.11.0 on the `iscanner_pixel` emulator:**
  - The library `Word → PDF` picker shows only Word files.
  - For an encrypted DOCX, the prompt shows the file name. A wrong password shows the inline error. The right password opens the viewer with the heading, bold, italic, list, table and image.
  - In merge, a DOCX plus a `.doc` gave a merged document whose `.doc` page includes emoji. An encrypted PDF that was skipped by Back was dropped silently.
  - Sharing a DOCX from Files reached the confirm view showing 2 pages, and Save opened the viewer.
- **Not checked on device:**
  - iOS: the Swift module compiles only in the CI IPA build.
  - A real-world DOCX made by Word or Google Docs; the test files were generated.
  - A Standard-encrypted DOCX, which still uses the JS spin loop in officecrypto-tool (50k SHA-1).
  - An encrypted `.doc`.

## Rulings and deferred items

The full list of rulings is in the final message of the session. In short:
- The print helper and `convertWordToPdf` return a cache URI instead of bytes.
- Task 2b (native module and own Agile decryptor) was added after the 3.5 s gate failure.
- The password order is known → `''` → ask; the spec text has been corrected.
- `DocumentMeta.source` stays `'merge'` for Word documents.
- Small fix rounds were verified by the controller.

**Seen on the device but not caused by this feature:**
- the `msf:` display name (`1000000032`) for files shared from Files;
- images are scaled to the page width, because mammoth does not keep image sizes.

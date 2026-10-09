# Progress — Merge password-protected PDFs (09/10/2026 sequence 1, part 1 of 4)

- **Spec:** `docs/superpowers/specs/2026-10-09-pdf-password-design.md`
- **Plan:** `docs/superpowers/plans/2026-10-09-pdf-password.md`
  - 4 tasks, run subagent-driven.
  - Sonnet wrote the code and reviewed Task 2.
  - Opus reviewed Task 3 and the whole branch.
  - The controller did Task 4 (device check and docs).
- **Branch:** `feat/pdf-password`, from master `73b6e9c`.
- **Version:** 1.10.0, versionCode 10, iOS buildNumber "10".
- **Requirement 09/10 seq 1 order:** 4 → 3 → 1 → 2.
  - Done: part 4 (multi-select delete, 1.8.0), part 3 (settings cards, 1.9.0) and this part (1.10.0).
  - Remaining: part 2 (DOC/DOCX → PDF, including password-protected files). It needs a feasibility spike first.

## What was built

- **`src/pdf/mergePdfs.ts`** takes an optional password in `loadPdf`, `getPdfPageCount(pdf, fileName?, password?)` and `mergePdfs(pdfs, passwords?)`. It also adds `unlockPdf(bytes, password, fileName?)`, which loads the file and re-saves it without `/Encrypt`.
  - A password was given and the library throws `Password incorrect` or `NEEDS PASSWORD` → `PdfPasswordError`, code `PDF_PASSWORD`.
  - An encrypt dictionary without `/Length` makes the library throw a TypeError → `PdfLoadError`, with the file name.
  - Errors never contain the password. Only the library's own error is kept as `cause`.
- **`src/components/PasswordPrompt.tsx`** is a Modal dialog.
  - The input is masked, uses `textContentType="password"` and has no autocorrect.
  - `Mở` (and keyboard submit) does nothing while the input is empty.
  - When `wrongBefore` is set, an inline error line shows.
  - `Bỏ qua file này`, back and a backdrop tap all mean skip. The backdrop is hidden from accessibility.
- **`usePasswordPrompt()`** returns `{ ask(fileName, wrongBefore): Promise<string|null>, element }`.
  - Only one ask is pending at a time; a new ask supersedes the old one.
  - Unmount resolves the pending ask with `null`, and any `ask` after unmount resolves `null` at once.
  - The prompt remounts for each ask, so the input starts empty every time.
  - **iOS:** the answer is resolved only after the Modal has dismissed. `onDismiss` resolves it, with `IOS_DISMISS_FALLBACK_MS` (600 ms) from `BottomSheet` as a fallback. So the next prompt, or an Alert, is never presented during a dismissal.
  - **Android:** the answer is resolved immediately.
- **`src/workflows/mergeWorkflow.ts`:**
  - `openPdfWithPassword(bytes, name, ask?, knownPassword?)` is the one ask loop, shared by the merge and incoming screens.
    1. If the file is encrypted, it first tries `''` silently. This opens owner-restricted PDFs that have no open password.
    2. If a carried password exists, it tries that next.
    3. Otherwise it asks. The `wrongBefore` flag is set only after a password the user typed has failed.
    4. If the user skips, it returns `null`.
  - It logs `pdf.unlocked { file }` and `pdf.unlockSkipped { file }`. The password is never logged.
  - `loadPickedPdfs` returns `{ loaded, failed, skipped }`. `LoadedPdf.password?` is carried to `createMergedDocument` and then to `mergePdfs`.
- **Merge screen:** renders the prompt element. Skipped files never cause a popup. If the user leaves the screen during a prompt, the flow stops and the copied files are deleted.
- **Incoming screen:** one encrypted PDF runs the ask loop.
  - `Lưu vào thư viện` stores `unlockPdf(...)`.
  - `Gộp với file khác` hands the file plus its password to the merge screen through the in-memory pending store (`IncomingFile.password?`), so it is not asked for again.
  - If the user skips with no images left, `noFiles` shows, but only when no other error popup was shown.

## Verification

- `npm test` passes: 73 suites, 767 tests. `npm run typecheck` is clean.
- The release APK 1.10.0 was built with Gradle after `expo prebuild` (`android/` had been at 1.7.0). It was tested on the `iscanner_pixel` emulator with throwaway PDFs generated in the session scratchpad:
  - RC4 40-bit, user password `secret`;
  - AES-128 V4/R4 (AESV2), user `secret`, owner `owner`;
  - owner-restricted, with an empty user password.
- **Results:**
  - The merge prompt shows the right file name, and Open is disabled while the input is empty.
  - A wrong password shows the inline error. The right password adds the row with 1 page.
  - The owner-restricted PDF is added without a prompt. The AES file opens with the owner password.
  - Back in the prompt skipped the file silently, with no popup.
  - Merging all 3 gives a document whose viewer shows "Secret page" twice and "AES secret page", so every page was decrypted.
  - Sharing an encrypted PDF from the Files app shows the prompt, then the confirm view with 1 page. After Save, the library document opens without a password.
- **Not checked on a device:**
  - the iOS prompt and Alert sequencing (needs an iPhone);
  - a real-world AES PDF from Word or Acrobat, and files that use object streams.

## Rulings and deferred items

- An empty password is blocked in the prompt, and `NEEDS PASSWORD` with a given password maps to `PdfPasswordError` (needed for the silent `''` attempt).
- After a review, the controller checked small fix diffs itself instead of dispatching a re-review.
- **Deferred minors:**
  - after unmount, the loop still parses the remaining files, though nothing leaks;
  - the prompt card has no `KeyboardAvoidingView`;
  - a share that arrives while a prompt is open waits for the next foreground;
  - some Task 1 tests are missing: `unlockPdf` with a wrong password, a password on a plain PDF, and the index in a `mergePdfs` wrong-password error.
- **Seen on the device but not caused by this feature:**
  - Sharing from the Android Files app gives an `msf:` URI, and the incoming screen shows `1000000029` as the file name. This is the share-receive display-name lookup.
  - `adb am start SEND` with a `content://media` URI fails with `FILE_READ`, because the shell cannot grant read access. This is a test harness artefact.
  - After a prompt closes, the merge screen's name field shows its text selected. This is cosmetic.

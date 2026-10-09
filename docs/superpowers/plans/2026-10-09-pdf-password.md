# Password-Protected PDF Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Picked or shared password-protected PDFs prompt for a password, one file at a time, and can then be merged or saved. Outputs and library copies are never password-protected, and passwords are never persisted or logged.

**Architecture:**
- **PDF layer** (`src/pdf/mergePdfs.ts`) passes `password` to `PDFDocument.load` and maps the results to typed errors. A new `unlockPdf` re-saves a PDF without encryption.
- **`PasswordPrompt`** plus the **`usePasswordPrompt()`** hook give an awaitable `ask(fileName, wrongBefore)`.
- **`loadPickedPdfs`** runs the ask loop. The merge and incoming screens wire it in.

**Tech Stack:** Expo SDK 57, RN 0.86, `@pdfme/pdf-lib` (via `src/pdf/pdfLib.ts`), TypeScript, and Jest + RNTL v14 (async).

**Spec:** `docs/superpowers/specs/2026-10-09-pdf-password-design.md` (§1 decisions, §2 modules and copy tables, §3 edge cases).

## Global Constraints

- **Library behaviour (probed):**
  - Opening an encrypted PDF without a password throws `EncryptedPDFError`.
  - A wrong password throws `Error('Password incorrect')`.
  - The user or the owner password opens the file. The result has `isEncrypted === false`, and `save()` writes no `/Encrypt`.
  - An encrypt dict without `/Length` throws a `TypeError` (`asNumber`). This is a fork bug, mapped to `PdfLoadError`.
- **New error:** `PdfPasswordError`, code `PDF_PASSWORD`, with `index` and `fileName` like `PdfLoadError`. Copy:
  - vi: title `Mật khẩu không đúng`, message `Mật khẩu của file PDF không đúng.`, reason `sai mật khẩu`;
  - en: title `Wrong password`, message `The PDF password is incorrect.`, reason `wrong password`.
- **Prompt copy** (`t.pdfPassword`):
  - vi: title `Nhập mật khẩu`, body `"${f}" được bảo vệ bằng mật khẩu.`, wrong `Mật khẩu không đúng, vui lòng thử lại.`, skip `Bỏ qua file này`, open `Mở`, placeholder `Mật khẩu`;
  - en: `Enter password`, `"${f}" is password-protected.`, `Wrong password, please try again.`, `Skip this file`, `Open`, `Password`.
- **Secrecy:**
  - Passwords exist only in memory: in the screen state and in in-memory pending store items.
  - They are never in settings, the library, logs or error objects. Errors must not carry the password in `message` or `cause` data.
  - Logs record only `pdf.unlocked { file }` and `pdf.unlockSkipped { file }`.
- **Library copy:** a single shared PDF saved to the library goes through `unlockPdf(bytes, password)`.
- **Version:** 1.10.0, `android.versionCode` 10, `ios.buildNumber` "10". Update the version test in `__tests__/plugins/withReleaseSigning.test.ts`.
- **Code rules:**
  - All copy goes in `src/i18n/`. The no-Vietnamese and no-console guards must stay green.
  - `src/pdf/*` must not import React or React Native.
  - `npm test` and `npm run typecheck` must pass at the end of every task.
- **Do not touch:** `.gitignore`, `.claude/`, `docs/claude-memory/`, `requirement/`, `New folder/`, `ios/` or `android/`.

## Review Focus

1. **A password leak.** The password must never appear in a log line, an `AppError` (message, fields or cause), or `settings.json`. Pinned in Task 1 (the error carries no password) and Task 3 (log calls are asserted not to contain the password).
2. **Wrong password, then right, then the user skips the next file.** Expected: the first file is added, the second is skipped silently, and there is no error popup. Pinned in Task 3.
3. **A single shared encrypted PDF that is saved.** Expected: the library file opens without a password (it is unlocked). Pinned in Task 3.
4. **The user leaves the merge screen while the prompt is open.** Expected: the prompt resolves `null`, the flow stops, and nothing throws after unmount. Pinned in Task 3.
5. **An encrypt dict without `/Length`, or an unknown crypto failure.** Expected: a `PDF_LOAD` popup with the file name, not `UNKNOWN`. Pinned in Task 1.

---

### Task 1: PDF layer — fixtures, password loading, unlock, error

**Files:**
- Create: `__tests__/fixtures/pdfPassword.ts`
- Modify:
  - `src/pdf/mergePdfs.ts`
  - `src/errors/AppError.ts`: `PdfPasswordError` and the `PDF_PASSWORD` code
  - `src/i18n/vi.ts`, `src/i18n/en.ts`: `errors.PDF_PASSWORD` and `errors.reason.PDF_PASSWORD`
- Test: `__tests__/pdf/mergePdfs.test.ts`, `__tests__/errors/AppError.test.ts`, `__tests__/errors/messages.test.ts`

**Interfaces (produces):**
- `makePasswordPdf(opts?: { userPassword?: string; ownerPassword?: string; withLength?: boolean; text?: string }): Uint8Array`
  - Defaults: user `secret`, owner `owner`, `withLength: true`, text `Secret page`.
  - It builds an RC4 40-bit (V1/R2) PDF with one page. Port the generator from the probe: padding string, `O = RC4(MD5(pad(owner))[0..5], pad(user))`, `key = MD5(pad(user) ‖ O ‖ P(LE) ‖ ID)[0..5]`, `U = RC4(key, PAD)`, object key = `MD5(key ‖ objnum(3 LE) ‖ gen(2 LE))[0..10]`, and the content stream encrypted with the object key.
  - Use Node `crypto` for MD5. RC4 is a small inline function.
- `class PdfPasswordError extends AppError` (opts `{ index?, fileName?, cause? }`).
- `loadPdf(bytes, index, fileName?, password?)` (internal).
- `getPdfPageCount(pdf, fileName?, password?): Promise<number>`
- `mergePdfs(pdfs: Uint8Array[], passwords?: (string | undefined)[]): Promise<Uint8Array>`
- `unlockPdf(bytes: Uint8Array, password: string, fileName?: string): Promise<Uint8Array>`

- [ ] **Step 1: write the failing tests.**
  - **No password:** `getPdfPageCount(makePasswordPdf(), 'p.pdf')` rejects with `PdfEncryptedError` (fileName `p.pdf`).
  - **Wrong password** (`'nope'`): rejects with `PdfPasswordError` (fileName `p.pdf`). Its `message` and `JSON.stringify` of its own fields do not contain `'nope'`.
  - **Correct password:** `'secret'` resolves to 1; `'owner'` resolves to 1.
  - **Missing `/Length`:** `makePasswordPdf({ withLength: false })` with `'secret'` rejects with `PdfLoadError` (fileName set).
  - **`unlockPdf`:** `unlockPdf(makePasswordPdf(), 'secret')` → `PDFDocument.load(out)` without a password gives 1 page. `Buffer.from(out).toString('latin1')` does not include `/Encrypt` and does include `Secret page`.
  - **`mergePdfs`:** `mergePdfs([plainPdf, makePasswordPdf()], [undefined, 'secret'])` gives 2 pages, has no `/Encrypt`, and includes `Secret page`.
  - **Error class and copy:** the `PdfPasswordError` class checks (`code`, `name`, `instanceof`), and `errorContent` gives the exact vi/en title and message from Global Constraints.
- [ ] **Step 2:** run the tests → FAIL.
- [ ] **Step 3:** implement. Detect a wrong password with `/password incorrect/i` on the error message, and a missing `/Length` as a `TypeError` thrown while a password was given. Keep `instanceof EncryptedPDFError` for the no-password case.
- [ ] **Step 4:** run the tests → PASS, then `npm test` and `npm run typecheck`.
- [ ] **Step 5:** commit — `feat: open password-protected PDFs and unlock them`.

### Task 2: Password prompt component and hook

**Files:**
- Create: `src/components/PasswordPrompt.tsx`
- Modify: `src/i18n/vi.ts`, `src/i18n/en.ts` (the `pdfPassword` section)
- Test: `__tests__/components/PasswordPrompt.test.tsx`

**Interfaces (produces):**
- `PasswordPrompt({ visible, fileName, wrongBefore, onSubmit(password: string), onSkip() })`. It is a Modal dialog, centred and themed. Its `TextInput` has `secureTextEntry`, `autoFocus`, `autoCapitalize="none"`, `autoCorrect={false}`, `textContentType="password"` and `accessibilityLabel={t.pdfPassword.placeholder}`. Open is disabled while the input is empty, `onSubmitEditing` opens, and back or a backdrop tap skips.
- `usePasswordPrompt(): { ask(fileName: string, wrongBefore: boolean): Promise<string | null>; element: ReactElement | null }`:
  - one pending ask at a time;
  - a new ask while one is pending resolves the previous one `null`;
  - unmount resolves any pending ask `null`;
  - the input is cleared for each ask.

- [ ] **Step 1: write the failing tests.** Use a probe component that calls `ask` and renders `element`.
  - The vi copy is shown: title, body with the file name, and the placeholder.
  - The input has `secureTextEntry`, and Open is disabled when the input is empty.
  - Typing `secret` and pressing Open resolves `'secret'`.
  - `wrongBefore=true` shows the wrong line.
  - Skip resolves `null`.
  - The Modal's `onRequestClose` resolves `null`.
  - Submitting from the keyboard (`submitEditing`) resolves the text.
  - Unmounting while pending resolves `null`.
  - The en copy is shown under an en `LocaleProvider`.
- [ ] **Step 2:** run the tests → FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run the tests → PASS, then `npm test` and `npm run typecheck`.
- [ ] **Step 5:** commit — `feat: password prompt dialog`.

### Task 3: Ask loop in the flows, and screen wiring

**Files:**
- Modify:
  - `src/workflows/mergeWorkflow.ts`
  - `src/share/types.ts`: `IncomingFile.password?: string`, in memory only
  - `app/merge.tsx`, `app/incoming.tsx`
  - `app.json`: 1.10.0 / 10 / "10"
  - `__tests__/plugins/withReleaseSigning.test.ts`
- Test: `__tests__/workflows/mergeWorkflow.test.ts` (or `mergeWorkflowErrors.test.ts`), `__tests__/app/merge.test.tsx`, `__tests__/app/incoming.test.tsx`

**Interfaces:**
- **Consumes:** Task 1 (`getPdfPageCount(..., password)`, `mergePdfs(..., passwords)`, `unlockPdf`, `PdfPasswordError`, `PdfEncryptedError`) and Task 2 (`usePasswordPrompt`).
- **Produces:**
  - `LoadedPdf = { uri; name; pageCount; password?: string }`
  - `loadPickedPdfs(deps: { readBytes; askPassword?: (fileName: string, wrongBefore: boolean) => Promise<string | null> }, files) → { loaded; failed: AppError[]; skipped: string[] }`
  - `createMergedDocument(...)` passes `files.map((f) => f.password)` to `mergePdfs`.

- [ ] **Step 1: write the failing tests.**
  - **`loadPickedPdfs`** (memory fixtures through a `readBytes` mock):
    - a password that is right the first time gives `loaded` with `password`;
    - a wrong password then a right one: the second ask gets `wrongBefore = true`, and the file is loaded;
    - skip puts the name in `skipped`, not in `failed`;
    - with no `askPassword`, `failed[0]` is a `PdfEncryptedError` (unchanged);
    - `log.info` was called with `pdf.unlocked { file }` and `pdf.unlockSkipped { file }`, and no log argument contains the password (stringify the mock calls).
  - **`createMergedDocument`** with an encrypted loaded file: the merged bytes added to the store are plain (no `/Encrypt`).
  - **Merge screen** (mock pick to return an encrypted file, keep `loadPickedPdfs` real, use the fixture bytes through the `readBytes` mock):
    - the dialog appears with the file name;
    - typing `secret` and pressing Open adds the row `p.pdf` (1 page);
    - pressing Merge passes the password through, so the store holds a plain PDF;
    - a second file skipped shows no `PDF_ENCRYPTED` popup (Review Focus 2);
    - unmounting with the prompt open throws nothing (Review Focus 4).
  - **Incoming:**
    - a single encrypted share shows the prompt;
    - with the correct password the confirm view shows 1 page;
    - Save stores bytes that load without a password (Review Focus 3);
    - Skip shows the "nothing usable" notice and goes home;
    - "Merge with other files" puts the file with its `password` in the pending store.
- [ ] **Step 2:** run the tests → FAIL.
- [ ] **Step 3:** implement. Render `element` from `usePasswordPrompt()` in both screens, and set the version.
- [ ] **Step 4:** run the tests → PASS, then `npm test` and `npm run typecheck`.
- [ ] **Step 5:** commit — `feat: ask for PDF passwords when merging and receiving files`.

### Task 4: Device verification and docs (controller)

- [ ] **Step 1:** build the release APK with Gradle; no native change, so no prebuild. Then start the emulator.
- [ ] **Step 2:** push the fixture-generated `co-mat-khau-that.pdf` (RC4, user `secret`) to `/sdcard/Download`, plus a real AES-encrypted PDF if one can be produced locally. Check:
  - merge: a wrong password shows the inline error, the right password adds the file, and the merged document opens in the viewer;
  - share: the single encrypted file is saved unlocked;
  - skipping is silent.
- [ ] **Step 3:** update the README (1.10.0 feature line and checklist) and `docs/superpowers/progress/2026-10-09-pdf-password.md`. Run `npm test` and `npm run typecheck`, then commit.

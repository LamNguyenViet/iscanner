# iScanner — Merge Password-Protected PDFs — Design Spec

- **Date:** 2026-10-09
- **Source:** requirement "09/10/2026 - sequence 1", part 1 of 4: "tính năng merge với tài liệu có mật khẩu, mở ô nhập mật khẩu và merge."
- **Builds on:**
  - typed errors (`AppError`, `showError`);
  - i18n (`useLocale`);
  - logging (`log`);
  - the merge and incoming flows.
- **Status:** approved in chat; awaiting written-spec review.

## 1. Goal and decisions

When a picked or shared PDF is password-protected, the app asks for the password, opens it, and lets the user merge it. The result is never password-protected.

| Topic | Decision |
|---|---|
| Decryption | On device, with the existing `@pdfme/pdf-lib` fork: `PDFDocument.load(bytes, { password })`. A probe (2026-10-09) showed RC4 PDFs open with the user or owner password, the merged output has no `/Encrypt`, and its content is plain. No new dependency. |
| When to ask | One file at a time, right after picking (merge screen) or on receipt (incoming screen). |
| Dialog | Title `Nhập mật khẩu`, the file name, a masked input, the buttons `Bỏ qua file này` / `Mở`. A wrong password shows an inline error and lets the user retry. |
| Skipped file | Not added to the list, and no error popup is shown for it. The other files continue. |
| Library copy | A single shared PDF saved to the library is stored **unlocked** (decrypted and re-saved), so the viewer and later merges need no password. |
| Secrecy | Passwords live only in screen memory for the current session. They are never written to settings, the library or logs. Logs record only `pdf.unlocked { file }` and `pdf.unlockSkipped { file }`. |
| Version | 1.10.0, versionCode 10, iOS buildNumber "10". |

Out of scope:
- remembering passwords;
- creating password-protected output;
- DOC/DOCX passwords (part 2).

## 2. Modules

### 2.1 `src/pdf/mergePdfs.ts` (changed) and errors

- `loadPdf(bytes, index, fileName?, password?)`:
  - no password and encrypted → `PdfEncryptedError` (as today);
  - password given and wrong (the library throws `Error('Password incorrect')`) → **new `PdfPasswordError` (code `PDF_PASSWORD`)**;
  - the library's `TypeError` on an encryption dictionary without `/Length` (known fork bug) → `PdfLoadError` with the file name;
  - anything else → `PdfLoadError`.
- `getPdfPageCount(bytes, fileName?, password?)`.
- `mergePdfs(items: { bytes: Uint8Array; password?: string }[])`, or keep `Uint8Array[]` plus a parallel `passwords?: (string | undefined)[]` (the plan fixes the shape).
- `unlockPdf(bytes, password): Promise<Uint8Array>` loads with the password and returns `doc.save()` (no encryption).
- **`PDF_PASSWORD` copy:**

  | Language | Title | Message |
  |---|---|---|
  | vi | Mật khẩu không đúng | Mật khẩu của file PDF không đúng. |
  | en | Wrong password | The PDF password is incorrect. |

  The short reason is vi `sai mật khẩu` / en `wrong password`. This code is normally handled inline by the dialog and only reaches `showError` as a fallback.

### 2.2 Password prompt

- **`src/components/PasswordPrompt.tsx`**, a Modal dialog:
  - title `t.pdfPassword.title`;
  - body `t.pdfPassword.body(fileName)`;
  - a `TextInput` with `secureTextEntry`, `autoFocus`, `autoCapitalize="none"`, `autoCorrect={false}`, and `textContentType="password"`;
  - the error line `t.pdfPassword.wrong` when `wrongBefore`;
  - the buttons `t.pdfPassword.skip` and `t.pdfPassword.open`. Open is disabled while the input is empty, and submitting from the keyboard also opens.
  - Back or a backdrop tap means skip.
- **`usePasswordPrompt()`** returns `{ ask(fileName: string, wrongBefore: boolean): Promise<string | null>, element }`. The screen renders `element`, and `null` means skip.
- **Copy:**

  | Key | vi | en |
  |---|---|---|
  | title | Nhập mật khẩu | Enter password |
  | body(f) | "f" được bảo vệ bằng mật khẩu. | "f" is password-protected. |
  | wrong | Mật khẩu không đúng, vui lòng thử lại. | Wrong password, please try again. |
  | skip | Bỏ qua file này | Skip this file |
  | open | Mở | Open |
  | placeholder | Mật khẩu | Password |

### 2.3 Flows

- **`loadPickedPdfs(deps: { readBytes; askPassword?: (fileName, wrongBefore) => Promise<string | null> }, files)`:**
  - For each file: read it, then `getPdfPageCount`.
  - On `PdfEncryptedError`, when `askPassword` exists, loop:
    1. ask (with `wrongBefore = false` the first time);
    2. on `null` → skip, recorded in `skipped` (not in `failed`);
    3. otherwise retry with the password;
    4. on `PdfPasswordError` → ask again with `wrongBefore = true`;
    5. on success → loaded, keeping `password`.
  - Without `askPassword`, the current behaviour stays (a `PDF_ENCRYPTED` failure).
  - Returns `{ loaded: LoadedPdf[] (with optional password), failed: AppError[], skipped: string[] }`.
- **`createMergedDocument`** passes each file's password to `mergePdfs`.
- **Merge screen:** wires `usePasswordPrompt().ask` and renders the element. Passwords stay in the in-memory list item and are dropped when the screen unmounts.
- **Incoming screen:**
  - **single PDF:** before the confirm view, if it is encrypted, run the same ask loop. Skip means no usable file (today's "nothing usable" path). On success the page count shows; Save stores `unlockPdf(bytes, password)`, while "Merge with other files" hands the file plus its password to the merge screen through the pending store (`IncomingFile` gains an optional in-memory `password`).
  - **several PDFs:** go to the merge screen, which asks.
- **Logs:** `pdf.unlocked { file }` and `pdf.unlockSkipped { file }`, never the password.

## 3. Edge cases

| Situation | Behaviour |
|---|---|
| Owner password typed instead of the user password | Opens (the library accepts either). |
| Wrong password 5 times | Keep asking; the user can always skip. |
| Encryption dictionary without `/Length` | Shows `PDF_LOAD` with the file name (library limitation). |
| AES-encrypted PDF (V4/V5) | Expected to work (the fork's crypto has AES). Verified on device with a real AES PDF; if it fails, it is a `PDF_LOAD` popup, not a crash. |
| User leaves the merge screen during the prompt | The prompt resolves `null` and the flow stops. |

## 4. Testing

- **Fixtures:** `__tests__/fixtures/pdfPassword.ts` builds RC4 40-bit PDFs (user `secret`, owner `owner`). Variants: with `/Length` and without.
- **Unit:**
  - `loadPdf` / `getPdfPageCount`: no password → encrypted; wrong → `PdfPasswordError`; right/owner → page count; missing `/Length` → `PdfLoadError`;
  - `unlockPdf` → output loads without a password, has no `/Encrypt` and contains the plain text;
  - `mergePdfs` with a password → merged output plain.
- **`loadPickedPdfs`:** right first time; wrong then right (the second ask has `wrongBefore = true`); skip → in `skipped`, not `failed`; no `askPassword` → `PDF_ENCRYPTED` failure (unchanged).
- **Components:** `PasswordPrompt` — masked input, Open disabled when empty, wrong-password line, skip/back resolve `null`, vi and en.
- **Screens:**
  - merge: an encrypted pick shows the dialog; entering the password adds the row; Merge produces a plain PDF;
  - incoming: a single encrypted share asks, then Save stores the unlocked bytes;
  - skip → "nothing usable".
- **Device:** a real password-protected PDF (RC4 and AES) merged on the emulator.

## 5. Success criteria

1. Password-protected PDFs can be unlocked by password and merged, from both the merge screen and the share flow.
2. Wrong passwords re-prompt and skipping is always possible.
3. Outputs and library copies are not password-protected, and passwords are never persisted or logged.
4. All tests and typecheck pass, and the flow is verified on the emulator.

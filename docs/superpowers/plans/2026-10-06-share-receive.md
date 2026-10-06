# Receive Shared Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iScanner receives PDFs/images shared or "opened with" from Zalo and other apps (Android share sheet + Open with; iOS Open in) and routes them into the existing merge / scan flows.

**Architecture:** Pure, tested core in `src/share/` (classify bytes, plan the flow, take-once pending store, import/copy to cache). Native entry points are config only (`expo-sharing` Android plugin, `android.intentFilters`, iOS `CFBundleDocumentTypes`) plus expo-router `app/+native-intent.ts`, which redirects file URLs and the `iscanner://expo-sharing` share link to a new `app/incoming.tsx` route. `merge`/`scan` consume the pending store instead of opening picker/camera.

**Tech Stack:** existing Expo SDK 57 / RN 0.86 / expo-router / expo-sharing 57.0.22 (experimental receive API) / expo-file-system / jest-expo + RNTL v14.

**Spec:** `docs/superpowers/specs/2026-10-06-share-receive-design.md`

## Global Constraints

- Branch `feat/share-receive`. No new dependencies. Routes in root `app/`; `src/share/*` has no RN UI imports.
- Vietnamese copy exactly: `Nhận file` (route title), `Đang nhận file…`, `Lưu vào thư viện`, `Gộp với file khác`, `Không có file PDF hoặc ảnh hợp lệ`, `Bỏ qua N file không hỗ trợ hoặc quá lớn` (N = number), `Không đọc được file`.
- Size limit **100 MB** per file (`100 * 1024 * 1024` bytes). Incoming copies live in `Paths.cache/incoming/`.
- Classification by magic bytes only: `%PDF` (0x25 0x50 0x44 0x46) → pdf; JPEG/PNG via existing `detectImageType` → image; else unsupported.
- `expo-sharing` share deep link is `<scheme>://expo-sharing` = `iscanner://expo-sharing` (verified: `node_modules/expo-sharing/android/src/main/java/expo/modules/sharing/ShareIntoUtils.kt:28-29`).
- app.json values exactly as spec §2 (plugin options, `android.intentFilters`, `ios.infoPlist` document types, `LSSupportsOpeningDocumentsInPlace: false`); iOS share extension disabled.
- RNTL v14: `render`/`act`/`fireEvent` are async — await. Mock native wrappers via factories. Never touch `.gitignore`, `.claude/`, `docs/claude-memory/`.

## Review Focus

1. **Zalo sends a PDF as `application/octet-stream` or with no file extension** → still classified as PDF by magic bytes and routed correctly (Task 1 test `classifies by bytes not name`; Task 2 test `names and extensions from bytes`).
2. **Share arrives while the app is already running (warm start) after a previous share was never finished** → old pending copies are deleted and replaced, no mixing (Task 1 test `setPending replaces and returns dropped files`; Task 3 test `new share replaces previous pending files`).
3. **A normal deep link / app launch must not be hijacked** → `+native-intent` only redirects `file://`, `content://` and `expo-sharing` paths (Task 3 test `leaves other paths unchanged`).
4. **Mixed share (PDFs + images)** → after the PDF step completes (save, merge, or cancel) the scan review opens with the images; images are not lost (Task 3 test `single pdf save with pending images goes to scan`; Task 4 test `merge with pending images continues to scan`).
5. **One unreadable/huge file in a batch** → others still imported; skip alert shows the count (Task 2 test `skips unreadable and too large`; Task 3 test `shows skipped count`).

---

### Task 1: Pure share core — classify, plan, pending store

**Files:**
- Create: `src/share/classify.ts`, `src/share/plan.ts`, `src/share/incomingStore.ts`, `src/share/types.ts`
- Test: `__tests__/share/classify.test.ts`, `__tests__/share/plan.test.ts`, `__tests__/share/incomingStore.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type IncomingFile = { uri: string; name: string; kind: 'pdf' | 'image'; size: number };
  export type IncomingPlan =
    | { kind: 'none' }
    | { kind: 'single-pdf'; pdf: IncomingFile; images: IncomingFile[] }
    | { kind: 'merge'; pdfs: IncomingFile[]; images: IncomingFile[] }
    | { kind: 'scan'; images: IncomingFile[] };
  // classify.ts
  export function classifyIncoming(bytes: Uint8Array): 'pdf' | 'image' | 'unsupported';
  // plan.ts
  export function planIncoming(files: IncomingFile[]): IncomingPlan; // preserves input order within each kind
  // incomingStore.ts (module-level singleton)
  export function setPending(p: { pdfs: IncomingFile[]; images: IncomingFile[] }): IncomingFile[]; // returns previously pending files (dropped)
  export function takePdfs(): IncomingFile[];   // returns and clears pdfs
  export function takeImages(): IncomingFile[]; // returns and clears images
  export function hasPendingImages(): boolean;
  export function clearPending(): IncomingFile[];
  ```

- [ ] **Step 1: Write failing tests**
  - classify: `%PDF-1.7` bytes → pdf; `makeJpeg(4,4)` → image; `makePng(4,4)` → image; `[1,2,3,4]` → unsupported; empty → unsupported; `classifies by bytes not name` (a PDF byte array regardless of any name) → pdf.
  - plan: `[]` → none; 1 pdf → single-pdf with `images: []`; 2 pdfs → merge; 2 images → scan; 1 pdf + 2 images → single-pdf with images; 2 pdfs + 1 image → merge with images; order preserved.
  - store: set then `takePdfs` returns pdfs and a second `takePdfs` returns `[]`; `hasPendingImages` true until `takeImages`; `setPending replaces and returns dropped files` (second set returns the first set's untaken files); `clearPending` returns and empties.
- [ ] **Step 2: Run** `npx jest __tests__/share` → FAIL
- [ ] **Step 3: Implement** the four files (reuse `detectImageType` from `src/pdf/images.ts`, catching its throw).
- [ ] **Step 4: Run** → PASS; `npm test`, `npm run typecheck` green.
- [ ] **Step 5: Commit** `git commit -m "feat: classify, plan and store incoming shared files"`

---

### Task 2: Import shared sources into cache + shared-payload wrapper

**Files:**
- Create: `src/share/importIncoming.ts`, `src/native/sharedPayloads.ts`
- Test: `__tests__/share/importIncoming.test.ts`, `__tests__/native/sharedPayloads.test.ts`

**Interfaces:**
- Consumes: `classifyIncoming`, `IncomingFile` (Task 1).
- Produces:
  ```ts
  export type SkippedFile = { name: string; reason: 'unsupported' | 'too-large' | 'unreadable' };
  export const MAX_INCOMING_BYTES = 100 * 1024 * 1024;
  export function importIncoming(sources: { uri: string; name?: string }[]): Promise<{ files: IncomingFile[]; skipped: SkippedFile[] }>;
  // sharedPayloads.ts
  export function readSharedFiles(): Promise<{ uri: string; name?: string }[]>; // Android only; [] on iOS/web or error
  export function clearSharedFiles(): void;
  ```
- Behaviour: for each source (sequential): copy with expo-file-system `File` (`new File(uri).copy(dest)` or read bytes + write — check SDK 57 API supports `content://` sources; if `copy` doesn't, read `bytes()` then write) to `Paths.cache/incoming/<id>.<ext>`; check size (`file.size` or bytes length) ≤ MAX → else delete copy, skip `too-large`; classify first bytes → unsupported → delete, skip; extension `pdf|jpg|png` from kind/type. Name: `source.name` ‖ decoded last path segment of `uri` ‖ `Tài liệu`. Any throw for one source → `unreadable`, continue. `readSharedFiles` maps `getResolvedSharedPayloadsAsync()` items with `contentType` in `file|image` and non-null `contentUri` to `{ uri: contentUri, name: payload.value? basename }`; wraps errors → `[]`.

- [ ] **Step 1: Write failing tests** (factory-mock `expo-file-system` with an in-memory file map supporting the calls you use; mock `expo-sharing`)
  - `imports pdf and image`: two sources with PDF/JPEG bytes → two files kind pdf/image, uris under `incoming/`, extensions `.pdf`/`.jpg`.
  - `names and extensions from bytes` (Review Focus 1): source `content://x/123` (no extension) with PDF bytes → name `123`, uri ends `.pdf`.
  - `skips unreadable and too large` (Review Focus 5): one source throws on read, one exceeds MAX (mock size), one valid → 1 file, skipped `[unreadable, too-large]` with names; rejected copies deleted.
  - `skips unsupported`: garbage bytes → skipped `unsupported`, copy deleted.
  - sharedPayloads: maps file/image payloads, ignores text/url, returns `[]` when the API rejects; `clearSharedFiles` calls `clearSharedPayloads`.
- [ ] **Step 2: Run** `npx jest __tests__/share/importIncoming.test.ts __tests__/native/sharedPayloads.test.ts` → FAIL
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; full suite + typecheck green.
- [ ] **Step 5: Commit** `git commit -m "feat: copy shared files into cache with size and type checks"`

---

### Task 3: Native config, system-path redirect and the incoming screen

**Files:**
- Modify: `app.json`, `app/_layout.tsx` (register `incoming` with title `Nhận file`)
- Create: `app/+native-intent.ts`, `app/incoming.tsx`, `src/share/redirect.ts` (pure helper)
- Test: `__tests__/share/redirect.test.ts`, `__tests__/app/incoming.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–2; `useLibrary` (`store.add`, `refresh`), `getPdfPageCount`, `readBytes`, `deleteFiles`, `router`.
- Produces: `redirectIncomingPath(path: string): string` (pure) used by `+native-intent.ts`'s `redirectSystemPath({ path })`:
  - `file://…` or `content://…` → `/incoming?uri=<encodeURIComponent(path)>`
  - path containing `expo-sharing` (e.g. `iscanner://expo-sharing`, `/expo-sharing`) → `/incoming`
  - anything else unchanged; never throws.
- `app/incoming.tsx` per spec §3.5. Sources: `uri` param → `[{ uri: decodeURIComponent(uri) }]`, else `await readSharedFiles()`; then `clearSharedFiles()`; `deleteFiles(setPending-dropped)` before importing (Review Focus 2). After import: skipped → `Alert.alert('Bỏ qua ' + n + ' file không hỗ trợ hoặc quá lớn')`. Plan handling per spec §3.5 (single-pdf confirm view shows name + `N trang`).

- [ ] **Step 1: app.json** — add the expo-sharing plugin entry, `android.intentFilters`, `ios.infoPlist` keys exactly as spec §2. Run `npx expo config --type introspect` (or `--json`) and confirm the plugin options and Info.plist keys appear; record the output snippet in the report.
- [ ] **Step 2: Write failing tests**
  - redirect: `file:///a/b.pdf` → `/incoming?uri=file%3A%2F%2F%2Fa%2Fb.pdf`; `content://com.zing.zalo/x` → `/incoming?uri=…`; `iscanner://expo-sharing` → `/incoming`; `leaves other paths unchanged` (`/`, `/scan`, `iscanner://viewer/abc`); garbage/empty → unchanged.
  - incoming screen (mock `src/native/sharedPayloads`, `src/share/importIncoming`, `expo-router`, `src/native/deleteFiles`; LibraryProvider with memory store):
    - `none goes home with alert` → Alert `Không có file PDF hoặc ảnh hợp lệ`, `router.replace('/')`.
    - `shows skipped count` → Alert `Bỏ qua 2 file không hỗ trợ hoặc quá lớn`.
    - `single pdf save goes to viewer` → press `Lưu vào thư viện` → library has 1 doc named after the file (without `.pdf`) → `router.replace('/viewer/<id>')`.
    - `single pdf save with pending images goes to scan` (Review Focus 4) → `router.replace('/scan')`, `hasPendingImages()` true.
    - `merge with other files` → press `Gộp với file khác` → `router.replace('/merge')`, `takePdfs()` returns the pdf.
    - `two pdfs go to merge`, `images go to scan`.
    - `new share replaces previous pending files` (Review Focus 2) → previous pending files passed to `deleteFiles`.
    - `uri param used instead of shared payloads` → `readSharedFiles` not called.
- [ ] **Step 3: Run** `npx jest __tests__/share/redirect.test.ts __tests__/app/incoming.test.tsx` → FAIL
- [ ] **Step 4: Implement** `redirect.ts`, `+native-intent.ts` (`export function redirectSystemPath({ path }: { path: string; initial: boolean }) { return redirectIncomingPath(path); }`), `incoming.tsx`, `_layout.tsx` registration.
- [ ] **Step 5: Run** → PASS; full suite, typecheck, `npx expo-doctor` green.
- [ ] **Step 6: Commit** `git commit -m "feat: receive shared and opened-with files into an incoming screen"`

---

### Task 4: Merge and scan consume pending files

**Files:**
- Modify: `app/merge.tsx`, `app/scan.tsx`
- Test: `__tests__/app/merge.test.tsx`, `__tests__/app/scan.test.tsx`

**Interfaces:**
- Consumes: `takePdfs`, `takeImages`, `hasPendingImages` (Task 1); existing `loadPickedPdfs`, `normalizePage`, `deleteFiles`.
- Behaviour per spec §3.6: merge mount → `const pending = takePdfs()`; non-empty → load them via `loadPickedPdfs(deps, pending.map(f => ({ uri: f.uri, name: f.name })))` and append (no picker); else existing auto-pick. After a successful merge: `hasPendingImages()` → `router.replace('/scan')` else existing viewer replace. Scan mount → `const pending = takeImages()`; non-empty → run the existing normalize pipeline on their uris (delete incoming copies after normalizing, same as raw scanner files) and append; else existing auto-scan. Keep the run-once guard.

- [ ] **Step 1: Write failing tests**
  - merge: `uses pending pdfs instead of picker` → `pickPdfs` not called, rows for the pending files shown; `merge with pending images continues to scan` (Review Focus 4) → after `Gộp PDF`, `router.replace('/scan')`.
  - scan: `uses pending images instead of camera` → `scanDocuments` not called, `normalizePage` called with the pending uris, rows shown, incoming copies deleted after normalizing.
  - existing tests unchanged and passing (store empty by default; reset store between tests via `clearPending()` in `beforeEach`).
- [ ] **Step 2: Run** `npx jest __tests__/app/merge.test.tsx __tests__/app/scan.test.tsx` → FAIL
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; full suite + typecheck green.
- [ ] **Step 5: Commit** `git commit -m "feat: merge and scan screens start from received files"`

---

### Task 5: Device verification and docs (controller runs this)

- [ ] **Step 1:** `npx expo prebuild --platform android` (regenerates manifest with the new intent filters), build x86_64 debug APK with Gradle (emulator off), then start the emulator and install; start Metro. Confirm `AndroidManifest.xml` contains SEND/SEND_MULTIPLE/VIEW filters.
- [ ] **Step 2: Verify on emulator:** push a PDF and a JPEG to Download; from the Files app share the PDF → iScanner listed → confirm screen → `Lưu vào thư viện`; share 2 PDFs → merge pre-filled; share images → scan review; mixed → PDF step then scan; Zalo-like `adb shell am start -a android.intent.action.SEND -t application/octet-stream --eu android.intent.extra.STREAM <content uri> -n com.dlbk.iscanner/.MainActivity`; "Open with" a PDF (VIEW).
- [ ] **Step 3:** iOS: push branch to GitHub only after the user approves; check the unsigned-IPA workflow and that the built Info.plist contains `CFBundleDocumentTypes` (from the prebuild step log or by running `npx expo prebuild --platform ios --no-install` locally and inspecting `ios/iScanner/Info.plist` — then delete the generated `ios/` folder).
- [ ] **Step 4:** README: feature line + manual checklist (Zalo share on Android, Open in on iPhone); progress log `docs/superpowers/progress/2026-10-06-share-receive.md`; `npm test`, typecheck; commit.
